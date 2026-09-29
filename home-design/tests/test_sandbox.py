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


def test_edit_mode_saves_changes_but_code_still_cannot_write(tiny_ifc, tmp_path):
    import ifcopenshell

    out = tmp_path / "edited.ifc"
    with IfcSandbox(tiny_ifc, mode="edit") as sb:
        ok, _ = sb.run("ifc.by_type('IfcWall')[0].Name = 'Renamed'")
        assert ok
        ok, msg = sb.run(f"ifc.write({str(out)!r})")
        assert not ok and "read-only sandbox" in msg
        assert sb.save(out)
    assert ifcopenshell.open(str(out)).by_type("IfcWall")[0].Name == "Renamed"


def test_read_mode_refuses_save(tiny_ifc, tmp_path):
    with IfcSandbox(tiny_ifc) as sb:
        sb.run("print(1)")
        assert not sb.save(tmp_path / "x.ifc")


def test_save_on_exit_survives_a_killed_host(tiny_ifc, tmp_path):
    import ifcopenshell

    from bench.common.sandbox import finish_saved

    dest = tmp_path / "edited.ifc"
    sb = IfcSandbox(tiny_ifc, mode="edit", save_on_exit=dest)
    ok, _ = sb.run("ifc.by_type('IfcWall')[0].Name = 'Kept'")
    assert ok
    sb.detach()  # as when the MCP server is killed: stdin closes, the worker saves
    assert finish_saved(dest, timeout_s=60)
    assert ifcopenshell.open(str(dest)).by_type("IfcWall")[0].Name == "Kept"


def test_finish_saved_rejects_truncated_file(tmp_path):
    from bench.common.sandbox import finish_saved

    dest = tmp_path / "x.ifc"
    (tmp_path / "x.ifc.part").write_text("ISO-10303-21;\nHEADER;\n" + "x" * 100)
    assert not finish_saved(dest, timeout_s=5) and not dest.exists()
