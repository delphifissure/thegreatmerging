from bench.common.sandbox import IfcSandbox


def test_reads_model(tiny_ifc):
    with IfcSandbox(tiny_ifc) as sb:
        ok, out = sb.run("print(len(ifc.by_type('IfcWall')))")
        assert ok and out.strip() == "2"


def test_namespace_is_fresh_each_call(tiny_ifc):
    with IfcSandbox(tiny_ifc) as sb:
        sb.run("x = 1")
        ok, out = sb.run("print(x)")
        assert not ok and "NameError" in out


def test_file_writes_are_blocked(tiny_ifc, tmp_path):
    target = tmp_path / "out.txt"
    with IfcSandbox(tiny_ifc) as sb:
        ok, out = sb.run(f"open({str(target)!r}, 'w').write('x')")
        assert not ok and "read-only sandbox" in out
        ok, out = sb.run(f"ifc.write({str(target)!r})")
        assert not ok and "read-only sandbox" in out
        ok, out = sb.run(f"import os; os.remove({str(tiny_ifc)!r})")
        assert not ok and "read-only sandbox" in out
        ok, out = sb.run("import subprocess; subprocess.run(['true'])")
        assert not ok and "read-only sandbox" in out
    assert not target.exists() and tiny_ifc.exists()


def test_reading_files_still_works(tiny_ifc):
    with IfcSandbox(tiny_ifc) as sb:
        ok, out = sb.run(f"print(open({str(tiny_ifc)!r}).read(9))")
        assert ok and out.startswith("ISO-10303")


def test_timeout_restarts_worker(tiny_ifc):
    with IfcSandbox(tiny_ifc, timeout_s=2) as sb:
        ok, out = sb.run("while True: pass")
        assert not ok and "timed out" in out
        ok, out = sb.run("print(len(ifc.by_type('IfcWall')))")
        assert ok and out.strip() == "2"


def test_output_is_truncated(tiny_ifc):
    with IfcSandbox(tiny_ifc) as sb:
        ok, out = sb.run("print('a' * 50000)")
        assert ok and "truncated" in out and len(out) < 21000
