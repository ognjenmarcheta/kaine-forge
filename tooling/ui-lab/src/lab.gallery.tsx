import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  Badge,
  BarChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DonutChart,
  EmptyState,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Kbd,
  LineChart,
  PageHeader,
  ProgressBar,
  RadialProgress,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sparkline,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Textarea
} from "@repo/ui";
import { Inbox, Plus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { LabNav } from "./lab.nav";
import type { LabCatalog } from "./lab.registry";

type Mode = "light" | "dark";

const statusAppearance = { Paid: "success", Overdue: "danger", Draft: "default" } as const;
const months = [
  { month: "Jan", visits: 820, signups: 120 },
  { month: "Feb", visits: 932, signups: 168 },
  { month: "Mar", visits: 901, signups: 154 },
  { month: "Apr", visits: 1234, signups: 210 },
  { month: "May", visits: 1290, signups: 236 },
  { month: "Jun", visits: 1330, signups: 251 }
];
const shares = [
  { channel: "Search", value: 48 },
  { channel: "Direct", value: 27 },
  { channel: "Referral", value: 15 },
  { channel: "Social", value: 10 }
];
const invoices: {
  id: string;
  customer: string;
  status: keyof typeof statusAppearance;
  amount: number;
}[] = [
  { id: "INV-1042", customer: "Northwind", status: "Paid", amount: 1280 },
  { id: "INV-1043", customer: "Contoso", status: "Overdue", amount: 640 },
  { id: "INV-1044", customer: "Fabrikam", status: "Draft", amount: 2210 }
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-ds-150">
      <h2 className="m-0 text-heading-xs text-ds-text-subtle">{title}</h2>
      {children}
    </section>
  );
}

/** Every core component once, under the theme and mode of the wrapping element. */
function Specimen() {
  const emailId = useId();
  const notesId = useId();
  const [range, setRange] = useState("month");

  return (
    <div className="grid gap-ds-400">
      <PageHeader
        actions={
          <Button>
            <Plus aria-hidden className="size-ds-200" />
            New report
          </Button>
        }
        description="Every component the template ships, under this theme."
        eyebrow="Gallery"
        title="Overview"
      />

      <Section title="Type">
        <div className="grid gap-ds-100">
          <p className="m-0 text-heading-xl">Heading extra large 1,284</p>
          <p className="m-0 text-heading-lg">Heading large</p>
          <p className="m-0 text-heading-md">Heading medium</p>
          <p className="m-0 text-heading-sm">Heading small</p>
          <p className="m-0 text-body-lg">
            Body large: the quick brown fox jumps over the lazy dog.
          </p>
          <p className="m-0 text-body">Body: the quick brown fox jumps over the lazy dog.</p>
          <p className="m-0 text-body-sm text-ds-text-subtle">Body small, subtle: metadata.</p>
        </div>
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap items-center gap-ds-100">
          <Button>Primary</Button>
          <Button appearance="subtle">Subtle</Button>
          <Button appearance="ghost">Ghost</Button>
          <Button appearance="link">Link</Button>
          <Button appearance="danger">Delete</Button>
          <Button disabled>Disabled</Button>
          <SegmentedControl aria-label="Range" value={range} onValueChange={setRange}>
            <SegmentedControlItem value="week">Week</SegmentedControlItem>
            <SegmentedControlItem value="month">Month</SegmentedControlItem>
            <SegmentedControlItem value="year">Year</SegmentedControlItem>
          </SegmentedControl>
          <span className="text-body-sm text-ds-text-subtle">
            Search <Kbd>⌘</Kbd> <Kbd>K</Kbd>
          </span>
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-ds-100">
          <Badge appearance="success">Paid</Badge>
          <Badge appearance="warning">Due soon</Badge>
          <Badge appearance="danger">Overdue</Badge>
          <Badge appearance="information">New</Badge>
          <Badge appearance="discovery" emphasis="bold">
            Beta
          </Badge>
          <Tag>Design</Tag>
          <AvatarGroup aria-label="Team" max={3} overflowLabel={(count) => `+${count}`}>
            {["AL", "BK", "CM", "DN", "EO"].map((initials) => (
              <Avatar key={initials}>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </div>
        <ProgressBar label="Storage used" value={68} />
      </Section>

      <Section title="Cards and figures">
        <div className="grid gap-ds-200 md:grid-cols-3">
          <StatCard label="Open invoices" value={18} />
          <StatCard label="Paid this month" value={42} />
          <StatCard label="Loading" value={undefined} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Visits</CardTitle>
            <CardDescription>The last six months</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              area
              data={months}
              index="month"
              series={[{ key: "visits", label: "Visits" }]}
              title="Visits per month"
              hideTitle
            />
          </CardContent>
        </Card>
        <div className="grid gap-ds-200 md:grid-cols-3">
          <Card>
            <CardContent className="pt-card">
              <BarChart
                data={months}
                index="month"
                series={[
                  { key: "visits", label: "Visits" },
                  { key: "signups", label: "Sign-ups" }
                ]}
                stacked
                title="Visits and sign-ups"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-card">
              <DonutChart
                centerLabel="Channels"
                centerValue="4"
                data={shares}
                index="channel"
                series={{ key: "value", label: "Share" }}
                title="Traffic by channel"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-ds-200 pt-card">
              <RadialProgress label="of goal" title="Quarter goal" value={72} />
              <Sparkline
                area
                data={months}
                index="month"
                series={{ key: "signups", label: "Sign-ups" }}
                title="Sign-up trend"
              />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead numeric>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{invoice.id}</TableCell>
                <TableCell>{invoice.customer}</TableCell>
                <TableCell>
                  <Badge appearance={statusAppearance[invoice.status]}>{invoice.status}</Badge>
                </TableCell>
                <TableCell numeric>{`$${invoice.amount.toLocaleString("en")}`}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Form">
        <div className="grid max-w-xl gap-ds-200">
          <Field>
            <FieldLabel htmlFor={emailId}>Email</FieldLabel>
            <Input aria-invalid id={emailId} defaultValue="ada@example" />
            <FieldError>Enter an email address such as ada@example.com.</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor={notesId}>Notes</FieldLabel>
            <Textarea id={notesId} placeholder="Optional" />
            <FieldDescription>Only your team sees notes.</FieldDescription>
          </Field>
          <Select defaultValue="weekly">
            <SelectTrigger aria-label="Report frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-ds-100">
            <Checkbox aria-label="Send a copy to me" defaultChecked />
            <span className="text-body">Send a copy to me</span>
          </div>
        </div>
      </Section>

      <Section title="Navigation and empty state">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <EmptyState
              action={<Button>Create invoice</Button>}
              description="Invoices you create show here."
              icon={Inbox}
              title="No invoices yet"
            />
          </TabsContent>
          <TabsContent value="open">Open invoices.</TabsContent>
        </Tabs>
      </Section>
    </div>
  );
}

function ThemePicker({
  label,
  themes,
  value,
  onChange
}: {
  label: string;
  themes: LabCatalog["themes"];
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {themes.map((theme) => (
          <SelectItem key={theme.name} value={theme.name}>
            {theme.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The gallery: one theme, or two side by side, in light or dark, plus the recreated screens. */
export function LabGallery({ catalog }: { catalog: LabCatalog }) {
  const { failures, screens, themes: labThemes } = catalog;
  const [first, setFirst] = useState(labThemes[0]?.name ?? "");
  const [second, setSecond] = useState("none");
  const [mode, setMode] = useState<Mode>("light");
  const panes = second === "none" ? [first] : [first, second];

  return (
    <div className="min-h-screen bg-ds-surface-sunken text-ds-text">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-ds-150 border-b border-ds-border bg-ds-surface px-ds-300 py-ds-150">
        <h1 className="m-0 text-heading-sm">Kaine UI Lab</h1>
        <div className="mr-auto">
          <LabNav current="components" />
        </div>
        {/* The .ui-select__trigger rule fills its container, so the containers set the width. */}
        <div className="w-56">
          <ThemePicker label="Theme" themes={labThemes} value={first} onChange={setFirst} />
        </div>
        <div className="w-56">
          <Select value={second} onValueChange={setSecond}>
            <SelectTrigger aria-label="Compare with">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No comparison</SelectItem>
              {labThemes.map((theme) => (
                <SelectItem key={theme.name} value={theme.name}>
                  {`Compare: ${theme.label}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SegmentedControl
          aria-label="Color mode"
          value={mode}
          onValueChange={(value) => setMode(value === "dark" ? "dark" : "light")}
        >
          <SegmentedControlItem value="light">Light</SegmentedControlItem>
          <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
        </SegmentedControl>
      </header>

      <p className="m-0 px-ds-300 pt-ds-200 text-body-sm text-ds-text-subtle">
        <a className="text-ds-link" href="#/screens">{`${screens.length} recreated screens`}</a>
        {failures.length > 0 ? ` · ${failures.length} did not load` : null}
      </p>

      <main className={panes.length > 1 ? "grid gap-ds-200 p-ds-200 xl:grid-cols-2" : "p-ds-200"}>
        {panes.map((theme) => (
          <div
            key={theme}
            className="rounded-card bg-ds-bg p-ds-300 text-ds-text"
            data-color-mode={mode}
            data-theme={theme}
          >
            <Specimen />
          </div>
        ))}
      </main>
    </div>
  );
}
