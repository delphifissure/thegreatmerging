import { Card } from "@/app/_components/Card";
import { PageHeader } from "@/app/_components/PageHeader";
import { LinkButton } from "@/app/_components/Button";

export default function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader title="That page isn't here" lede="The link may be old, or it may point to a step that isn't open yet." />
      <Card>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/">Back to the start</LinkButton>
          <LinkButton href="/setup" variant="secondary">
            Setup
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
