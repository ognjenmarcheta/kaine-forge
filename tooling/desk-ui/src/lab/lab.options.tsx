import {
  AppSidebar,
  Avatar,
  AvatarFallback,
  AvatarGroup,
  Badge,
  Banner,
  BarChart,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardIcon,
  CardTitle,
  Checkbox,
  CopyButton,
  FilterMenu,
  Gauge,
  LineChart,
  NavUser,
  PageHeader,
  ProgressBar,
  ProportionBar,
  RadialProgress,
  SearchTrigger,
  SegmentedControl,
  SegmentedControlItem,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  Sparkline,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TopNav,
  cn,
  useSidebar,
  type AvatarFallbackProps,
  type ChartDatum,
  type FilterMenuOption,
  type GaugePart,
  type NavUserData,
  type ProgressBarPart,
  type ProportionBarSegment,
  type StatCardDelta,
  type TopNavItem
} from "@repo/ui";
import {
  Activity,
  CalendarDays,
  ChevronsLeft,
  CircleAlert,
  Ellipsis,
  FileText,
  FolderOpen,
  Funnel,
  Info,
  LayoutDashboard,
  Users,
  Wallet,
  type LucideIcon
} from "lucide-react";
import { useState, type ReactNode } from "react";

type Period = "7d" | "30d" | "12m";
type InvoiceStatus = "draft" | "overdue" | "paid";
type SortColumn = "amount" | "customer";

interface Invoice {
  amount: number;
  currency: string;
  customer: string;
  due: string;
  id: string;
  issued: string;
  owner: string;
  status: string;
}

interface SidebarLink {
  current: boolean;
  icon: LucideIcon;
  label: string;
}

/** A part named in a `Legend`, which takes the chart slot of its position. */
interface LegendItem {
  key: string;
  label: string;
  value: number;
}

const periods: readonly FilterMenuOption<Period>[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 12 months", value: "12m" }
];
const statuses: readonly FilterMenuOption<InvoiceStatus>[] = [
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Draft", value: "draft" }
];
const revenueDelta: StatCardDelta = {
  direction: "up",
  directionLabel: "Up",
  label: "+12%",
  tone: "success"
};
const months: ChartDatum[] = [
  { month: "Jan", visits: 820, signups: 120 },
  { month: "Feb", visits: 932, signups: 168 },
  { month: "Mar", visits: 901, signups: 154 },
  { month: "Apr", visits: 1334, signups: 262 },
  { month: "May", visits: 1290, signups: 236 },
  { month: "Jun", visits: 1210, signups: 221 },
  { month: "Jul", visits: 1105, signups: 198 },
  { month: "Aug", visits: 1018, signups: 187 },
  { month: "Sep", visits: 1164, signups: 205 },
  { month: "Oct", visits: 1240, signups: 214 },
  { month: "Nov", visits: 1302, signups: 230 },
  { month: "Dec", visits: 1188, signups: 209 }
];
const firstHalf = months.slice(0, 6);
const channels: ChartDatum[] = [
  { channel: "Organic search", visits: 4820 },
  { channel: "Direct", visits: 2710 },
  { channel: "Referral partners", visits: 1530 },
  { channel: "Social media", visits: 980 }
];
const invoices: readonly Invoice[] = [
  {
    amount: 1280,
    currency: "USD",
    customer: "Northwind Traders",
    due: "2 Oct 2026",
    id: "INV-1042",
    issued: "2 Sep 2026",
    owner: "Ada Lovelace",
    status: "Paid"
  },
  {
    amount: 640,
    currency: "EUR",
    customer: "Contoso Pharmacy",
    due: "5 Oct 2026",
    id: "INV-1043",
    issued: "5 Sep 2026",
    owner: "Grace Hopper",
    status: "Overdue"
  },
  {
    amount: 2210,
    currency: "USD",
    customer: "Fabrikam Clinics",
    due: "12 Oct 2026",
    id: "INV-1044",
    issued: "12 Sep 2026",
    owner: "Alan Turing",
    status: "Draft"
  },
  {
    amount: 975,
    currency: "GBP",
    customer: "Adatum Health",
    due: "20 Oct 2026",
    id: "INV-1045",
    issued: "20 Sep 2026",
    owner: "Katherine Johnson",
    status: "Paid"
  }
];
const ada: NavUserData = { email: "ada@example.com", name: "Ada Lovelace" };
const team: readonly { initials: string; tone: NonNullable<AvatarFallbackProps["tone"]> }[] = [
  { initials: "AL", tone: "chart-1" },
  { initials: "GH", tone: "chart-2" },
  { initials: "AT", tone: "chart-3" },
  { initials: "KJ", tone: "chart-4" },
  { initials: "MH", tone: "chart-5" }
];
const topNavItems: readonly TopNavItem[] = [
  { current: true, href: "#/options", label: "Overview" },
  { href: "#/options", label: "Patients" },
  { href: "#/options", label: "Schedule" },
  { href: "#/options", label: "Billing" }
];
const clinicLinks: readonly SidebarLink[] = [
  { current: true, icon: LayoutDashboard, label: "Overview" },
  { current: false, icon: Users, label: "Patients" },
  { current: false, icon: CalendarDays, label: "Schedule" },
  { current: false, icon: FileText, label: "Invoices" }
];
const reportLinks = ["Monthly", "Quarterly", "Yearly"] as const;
const projectParts: GaugePart[] = [
  { key: "done", label: "Done", value: 12 },
  { key: "over", label: "Over half", value: 8 },
  { key: "under", label: "Under half", value: 4 }
];
const species: readonly ProportionBarSegment[] = [
  { key: "dogs", label: "Dogs", value: 48 },
  { key: "cats", label: "Cats", value: 31 },
  { key: "birds", label: "Birds", value: 12 },
  { fill: "hatch", key: "other", label: "Other", value: 9 }
];
const sprintParts = [
  { appearance: "chart-1", key: "design", label: "Design", value: 24 },
  { appearance: "chart-2", key: "build", label: "Build", value: 36 },
  { appearance: "chart-3", key: "review", label: "Review", value: 12 }
] as const satisfies readonly (ProgressBarPart & LegendItem)[];
/** The first chart slots, which parts without their own color take in order. */
const slotFills = ["bg-ds-chart-1", "bg-ds-chart-2", "bg-ds-chart-3"] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-ds-150">
      <h2 className="m-0 text-heading-xs text-ds-text-subtle">{title}</h2>
      {children}
    </section>
  );
}

/** One demo under a caption that names, as code, the option it sets. */
function Demo({
  children,
  className,
  option
}: {
  children: ReactNode;
  className?: string;
  option: string;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-ds-100", className)}>
      <p className="m-0 text-body-sm text-ds-text-subtle">
        <code>{option}</code>
      </p>
      {children}
    </div>
  );
}

/** Names the parts of a figure whose own legend is off, each beside the swatch of its slot. */
function Legend({ items }: { items: readonly LegendItem[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-ds-200 gap-y-ds-050 p-0 text-body-sm text-ds-text-subtle">
      {items.map((item, position) => (
        <li key={item.key} className="flex items-center gap-ds-075">
          <span aria-hidden="true" className={cn("size-ds-100 rounded-sm", slotFills[position])} />
          {item.label}
          <span className="font-medium tabular-nums text-ds-text">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function ButtonOptions() {
  return (
    <Section title="Button">
      <Demo option='appearance="outline"'>
        <div className="flex flex-wrap gap-ds-100 rounded-card bg-ds-surface-sunken p-ds-200">
          <Button appearance="outline">Export</Button>
        </div>
      </Demo>
    </Section>
  );
}

function FilterMenuOptions() {
  const [period, setPeriod] = useState<Period>("7d");
  const [chosen, setChosen] = useState<readonly InvoiceStatus[]>(["paid", "overdue"]);

  return (
    <Section title="FilterMenu">
      <div className="flex flex-wrap items-start gap-ds-300">
        <Demo option="FilterMenu">
          <FilterMenu label="Period" options={periods} value={period} onValueChange={setPeriod} />
        </Demo>
        <Demo option='show="label"'>
          <FilterMenu
            label="Date"
            options={periods}
            show="label"
            value={period}
            onValueChange={setPeriod}
          />
        </Demo>
        <Demo option="chevron={false}">
          <FilterMenu
            chevron={false}
            icon={<CalendarDays aria-hidden />}
            label="Period"
            options={periods}
            value={period}
            onValueChange={setPeriod}
          />
        </Demo>
        <Demo option='iconPlacement="start"'>
          <FilterMenu
            icon={<CalendarDays aria-hidden />}
            iconPlacement="start"
            label="Period"
            options={periods}
            value={period}
            onValueChange={setPeriod}
          />
        </Demo>
        <Demo option='iconPlacement="end"'>
          <FilterMenu
            icon={<Funnel aria-hidden />}
            iconPlacement="end"
            label="Filter"
            options={periods}
            show="label"
            value={period}
            onValueChange={setPeriod}
          />
        </Demo>
        <Demo option='width="widest"'>
          <FilterMenu
            label="Period"
            options={periods}
            value={period}
            width="widest"
            onValueChange={setPeriod}
          />
        </Demo>
        <Demo option="multiple">
          <FilterMenu
            label="Status"
            multiple
            options={statuses}
            value={chosen}
            onValueChange={setChosen}
          />
        </Demo>
      </div>
    </Section>
  );
}

function CardOptions() {
  const [period, setPeriod] = useState<Period>("30d");

  return (
    <Section title="Card">
      <p className="m-0 text-body-sm text-ds-text-subtle">
        Each card is marked <code>@container/card</code>: below 24rem, an action moves under the
        title.
      </p>
      <div className="grid gap-ds-300 sm:grid-cols-2 xl:grid-cols-4">
        <Demo option="CardAction">
          <Card className="@container/card">
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Paid invoices</CardDescription>
              <CardAction>
                <FilterMenu
                  label="Period"
                  options={periods}
                  value={period}
                  onValueChange={setPeriod}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-heading-lg">$48,210</p>
            </CardContent>
          </Card>
        </Demo>
        <Demo option="CardAction wrap={false}">
          <Card className="@container/card">
            <CardHeader>
              <CardTitle>Open tickets</CardTitle>
              <CardDescription>Waiting for a reply</CardDescription>
              <CardAction wrap={false}>
                <Button appearance="ghost" aria-label="Open tickets options" spacing="icon">
                  <Ellipsis aria-hidden />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-heading-lg">23</p>
            </CardContent>
          </Card>
        </Demo>
        <Demo option="CardIcon">
          <Card className="@container/card">
            <CardHeader>
              <CardIcon>
                <Wallet aria-hidden />
              </CardIcon>
              <CardTitle>Payouts</CardTitle>
              <CardDescription>Sent every Friday</CardDescription>
            </CardHeader>
          </Card>
        </Demo>
        <Demo option="CardIcon, CardAction">
          <Card className="@container/card">
            <CardHeader>
              <CardIcon>
                <Users aria-hidden />
              </CardIcon>
              <CardTitle>Patients</CardTitle>
              <CardDescription>Seen this period</CardDescription>
              <CardAction>
                <FilterMenu
                  label="Period"
                  options={periods}
                  value={period}
                  onValueChange={setPeriod}
                />
              </CardAction>
            </CardHeader>
          </Card>
        </Demo>
      </div>
    </Section>
  );
}

/** The section's h2, then an h2, h3, and h4 title in that order, so no heading level skips. */
function CardTitleOptions() {
  return (
    <Section title="CardTitle">
      <div className="grid gap-ds-300 sm:grid-cols-3">
        <Demo option='as="h2"'>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Billing</CardTitle>
              <CardDescription>A title at the page&apos;s second level.</CardDescription>
            </CardHeader>
          </Card>
        </Demo>
        <Demo option="CardTitle (h3)">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>The default level.</CardDescription>
            </CardHeader>
          </Card>
        </Demo>
        <Demo option='as="h4"'>
          <Card>
            <CardHeader>
              <CardTitle as="h4">Overdue</CardTitle>
              <CardDescription>A title under an h3.</CardDescription>
            </CardHeader>
          </Card>
        </Demo>
      </div>
    </Section>
  );
}

function StatCardOptions() {
  return (
    <Section title="StatCard">
      <div className="grid gap-ds-300 sm:grid-cols-2 xl:grid-cols-4">
        <Demo option="icon">
          <StatCard icon={<Users aria-hidden />} label="Active patients" value="1,284" />
        </Demo>
        <Demo option='iconPlacement="end"'>
          <StatCard
            icon={<Activity aria-hidden />}
            iconPlacement="end"
            label="Visits today"
            value="86"
          />
        </Demo>
        <Demo option='iconPlacement="top", action'>
          <StatCard
            action={
              <Button appearance="ghost" aria-label="Revenue options" spacing="icon">
                <Ellipsis aria-hidden />
              </Button>
            }
            icon={<Wallet aria-hidden />}
            iconPlacement="top"
            label="Revenue"
            value="$48,210"
          />
        </Demo>
        <Demo option='iconPlacement="leading"'>
          <StatCard
            icon={<CalendarDays aria-hidden />}
            iconPlacement="leading"
            label="Booked slots"
            value="312"
          />
        </Demo>
        <Demo option='delta={{ appearance: "badge" }}'>
          <StatCard
            delta={{ ...revenueDelta, appearance: "badge" }}
            label="Revenue"
            value="$48,210"
          />
        </Demo>
        <Demo option='delta={{ appearance: "text" }}'>
          <StatCard
            delta={{ ...revenueDelta, appearance: "text" }}
            label="Revenue"
            value="$48,210"
          />
        </Demo>
        <Demo option='delta={{ appearance: "icon" }}'>
          <StatCard
            delta={{ ...revenueDelta, appearance: "icon" }}
            label="Revenue"
            value="$48,210"
          />
        </Demo>
        <Demo option='deltaPlacement="below", description'>
          <StatCard
            delta={revenueDelta}
            deltaPlacement="below"
            description="vs. last month"
            label="Revenue"
            value="$48,210"
          />
        </Demo>
        <Demo option='deltaPlacement="beside"'>
          <StatCard
            delta={revenueDelta}
            deltaPlacement="beside"
            description="vs. last month"
            label="Revenue"
            value="$48,210"
          />
        </Demo>
        <Demo option='deltaPlacement="end"'>
          <StatCard
            delta={revenueDelta}
            deltaPlacement="end"
            description="vs. last month"
            label="Revenue"
            value="$48,210"
          />
        </Demo>
        <Demo option="visual">
          <StatCard
            label="Sign-ups"
            value="1,284"
            visual={
              <Sparkline
                area
                data={firstHalf}
                hideTitle
                index="month"
                series={{ key: "signups", label: "Sign-ups" }}
                title="Sign-ups, January to June"
              />
            }
          />
        </Demo>
        <Demo option="wrap={false}">
          <StatCard
            delta={revenueDelta}
            label="Quarter goal"
            value="72%"
            visual={<RadialProgress hideTitle size="xs" title="Quarter goal" value={72} />}
            wrap={false}
          />
        </Demo>
      </div>
    </Section>
  );
}

function BadgeOptions() {
  return (
    <Section title="Badge">
      <div className="flex flex-wrap items-start gap-ds-400">
        <Demo option='emphasis="outline"'>
          <div className="flex flex-wrap gap-ds-100">
            <Badge emphasis="outline">Draft</Badge>
            <Badge appearance="success" emphasis="outline">
              Paid
            </Badge>
            <Badge appearance="warning" emphasis="outline">
              Due soon
            </Badge>
            <Badge appearance="danger" emphasis="outline">
              Overdue
            </Badge>
          </div>
        </Demo>
        <Demo option='appearance="selected"'>
          <div className="flex flex-wrap gap-ds-100">
            <Badge>Week</Badge>
            <Badge appearance="selected">Month</Badge>
            <Badge>Year</Badge>
            <Badge appearance="selected" emphasis="bold">
              Chosen
            </Badge>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

function SearchTriggerOptions() {
  return (
    <Section title="SearchTrigger">
      <div className="flex flex-wrap items-start gap-ds-400">
        <Demo option="SearchTrigger shortcut">
          <SearchTrigger label="Search…" shortcut={{ apple: "⌘K", other: "Ctrl K" }} />
        </Demo>
        <Demo option='show="icon"'>
          <SearchTrigger label="Search" show="icon" />
        </Demo>
      </div>
    </Section>
  );
}

function SegmentedControlOptions() {
  const [range, setRange] = useState("month");

  return (
    <Section title="SegmentedControl">
      <Demo option='appearance="brand"'>
        <div className="flex flex-wrap items-center gap-ds-200 rounded-card bg-ds-bg-brand-bold p-ds-200 text-ds-text-brand-inverse">
          <span className="text-body font-medium">Revenue</span>
          <SegmentedControl
            appearance="brand"
            aria-label="Revenue range"
            value={range}
            onValueChange={setRange}
          >
            <SegmentedControlItem value="week">Week</SegmentedControlItem>
            <SegmentedControlItem value="month">Month</SegmentedControlItem>
            <SegmentedControlItem value="year">Year</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </Demo>
    </Section>
  );
}

/** NavUser reads the sidebar context, so its demos sit in a provider; each on the sunken sidebar fill. */
function NavUserOptions() {
  return (
    <Section title="NavUser">
      <SidebarProvider className="grid min-h-0 gap-ds-300 sm:grid-cols-2 xl:grid-cols-5">
        <Demo option='avatarTone="brand"'>
          <div className="rounded-card bg-ds-surface-sunken p-ds-050">
            <NavUser
              avatarTone="brand"
              logoutLabel="Log out"
              onLogout={() => undefined}
              user={ada}
            />
          </div>
        </Demo>
        <Demo option="status">
          <div className="rounded-card bg-ds-surface-sunken p-ds-050">
            <NavUser
              logoutLabel="Log out"
              onLogout={() => undefined}
              status={{ label: "Online", tone: "success" }}
              user={ada}
            />
          </div>
        </Demo>
        <Demo option='trailingIcon="chevrons"'>
          <div className="rounded-card bg-ds-surface-sunken p-ds-050">
            <NavUser
              logoutLabel="Log out"
              onLogout={() => undefined}
              trailingIcon="chevrons"
              user={ada}
            />
          </div>
        </Demo>
        <Demo option='trailingIcon="dots"'>
          <div className="rounded-card bg-ds-surface-sunken p-ds-050">
            <NavUser
              logoutLabel="Log out"
              onLogout={() => undefined}
              trailingIcon="dots"
              user={ada}
            />
          </div>
        </Demo>
        <Demo option="user.role">
          <div className="rounded-card bg-ds-surface-sunken p-ds-050">
            <NavUser
              logoutLabel="Log out"
              onLogout={() => undefined}
              user={{ ...ada, role: "Head nurse" }}
            />
          </div>
        </Demo>
      </SidebarProvider>
    </Section>
  );
}

function BannerOptions() {
  return (
    <Section title="Banner">
      <div className="grid gap-ds-300">
        <Demo option='emphasis="subtle"'>
          <Banner
            appearance="information"
            emphasis="subtle"
            icon={<Info aria-hidden className="size-ds-200" />}
          >
            Maintenance is planned for Sunday at 02:00.
          </Banner>
        </Demo>
        <Demo option="urgent">
          <Banner
            appearance="error"
            icon={<CircleAlert aria-hidden className="size-ds-200" />}
            urgent
          >
            Payments failed. Update the card on file.
          </Banner>
        </Demo>
      </div>
    </Section>
  );
}

function CheckboxOptions() {
  return (
    <Section title="Checkbox">
      <Demo option='checked="indeterminate"'>
        <div className="flex flex-wrap items-center gap-ds-100">
          <Checkbox aria-label="Select all invoices" checked="indeterminate" />
          <span className="text-body">Select all invoices</span>
          <span className="text-body-sm text-ds-text-subtle">2 of 4 selected</span>
        </div>
      </Demo>
    </Section>
  );
}

function TableOptions() {
  const [sort, setSort] = useState<{
    column: SortColumn;
    direction: "ascending" | "descending";
  }>({ column: "amount", direction: "descending" });
  const rows = [...invoices].sort((a, b) => {
    const order =
      sort.column === "amount" ? a.amount - b.amount : a.customer.localeCompare(b.customer, "en");
    return sort.direction === "ascending" ? order : -order;
  });
  const sortBy = (column: SortColumn) =>
    setSort((current) => ({
      column,
      direction:
        current.column === column && current.direction === "ascending" ? "descending" : "ascending"
    }));
  const sortOf = (column: SortColumn) => (sort.column === column ? { sort: sort.direction } : {});
  const money = (invoice: Invoice) =>
    invoice.amount.toLocaleString("en", { currency: invoice.currency, style: "currency" });

  return (
    <Section title="Table">
      <div className="grid gap-ds-300 lg:grid-cols-3">
        <Demo option="scrollLabel">
          {/* min-w-0: the table's width must not stretch the box, so the table scrolls inside it. */}
          <div className="min-w-0 rounded-card border border-ds-border">
            <Table className="whitespace-nowrap" scrollLabel="Invoice details">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead numeric>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{invoice.id}</TableCell>
                    <TableCell>{invoice.customer}</TableCell>
                    <TableCell>{invoice.owner}</TableCell>
                    <TableCell>{invoice.status}</TableCell>
                    <TableCell>{invoice.issued}</TableCell>
                    <TableCell>{invoice.due}</TableCell>
                    <TableCell>{invoice.currency}</TableCell>
                    <TableCell numeric>{money(invoice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Demo>
        <Demo className="lg:col-span-2" option="TableHead onSort, sort">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead onSort={() => sortBy("customer")} {...sortOf("customer")}>
                  Customer
                </TableHead>
                <TableHead numeric onSort={() => sortBy("amount")} {...sortOf("amount")}>
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{invoice.id}</TableCell>
                  <TableCell>{invoice.customer}</TableCell>
                  <TableCell numeric>{money(invoice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Demo>
      </div>
    </Section>
  );
}

/**
 * The trigger turns its chevrons with the sidebar state. The sidebar is inline
 * (`collapsible="none"`), so the trigger shows or hides it here instead of sliding it.
 */
function AppSidebarDemo() {
  const { open } = useSidebar();

  return (
    <div className="flex flex-wrap items-start gap-ds-300">
      <Demo option="SidebarTrigger children">
        <div className="flex items-center gap-ds-100">
          <SidebarTrigger aria-expanded={open} label="Show the sidebar">
            <ChevronsLeft
              aria-hidden
              className={cn(
                "size-ds-200 transition-transform duration-control ease-standard",
                !open && "rotate-180"
              )}
            />
          </SidebarTrigger>
          <span className="text-body-sm text-ds-text-subtle">{open ? "Open" : "Closed"}</span>
        </div>
      </Demo>
      <Demo option="headerClassName, footerClassName">
        {open ? (
          <div className="relative w-fit overflow-hidden rounded-card border border-ds-border">
            <AppSidebar
              collapsible="none"
              footerClassName="border-t border-ds-border"
              headerClassName="px-ds-200 pt-ds-200"
              label="Clinic"
              navMain={
                <SidebarGroup>
                  <SidebarGroupLabel>Clinic</SidebarGroupLabel>
                  <SidebarMenu>
                    {clinicLinks.map((link) => (
                      <SidebarMenuItem key={link.label}>
                        <SidebarMenuButton asChild isActive={link.current}>
                          <a aria-current={link.current ? "page" : undefined} href="#/options">
                            <link.icon aria-hidden />
                            <span>{link.label}</span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroup>
              }
              organizationSwitcher={<p className="m-0 text-heading-xs">Northwind Clinic</p>}
              railLabel="Show the sidebar"
              user={
                <NavUser
                  logoutLabel="Log out"
                  onLogout={() => undefined}
                  trailingIcon="chevrons"
                  user={ada}
                />
              }
            />
          </div>
        ) : (
          <p className="m-0 text-body-sm text-ds-text-subtle">The sidebar is closed.</p>
        )}
      </Demo>
    </div>
  );
}

function AppSidebarOptions() {
  return (
    <Section title="AppSidebar">
      <SidebarProvider className="block min-h-0">
        <AppSidebarDemo />
      </SidebarProvider>
    </Section>
  );
}

function SidebarOptions() {
  return (
    <Section title="Sidebar">
      <SidebarProvider className="min-h-0 flex-wrap items-start gap-ds-300">
        <Demo option='surface="raised", SidebarMenuButton variant="neutral"'>
          <Sidebar
            className="rounded-card border border-ds-border"
            collapsible="none"
            label="Neutral sidebar"
            surface="raised"
          >
            <SidebarContent>
              <SidebarGroup>
                <SidebarMenu>
                  {clinicLinks.map((link) => (
                    <SidebarMenuItem key={link.label}>
                      <SidebarMenuButton asChild isActive={link.current} variant="neutral">
                        <a aria-current={link.current ? "page" : undefined} href="#/options">
                          <link.icon aria-hidden />
                          <span>{link.label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </Demo>
        <Demo option='SidebarMenuButton variant="brand"'>
          <Sidebar
            className="rounded-card border border-ds-border"
            collapsible="none"
            label="Brand sidebar"
          >
            <SidebarContent>
              <SidebarGroup>
                <SidebarMenu>
                  {clinicLinks.map((link) => (
                    <SidebarMenuItem key={link.label}>
                      <SidebarMenuButton asChild isActive={link.current} variant="brand">
                        <a aria-current={link.current ? "page" : undefined} href="#/options">
                          <link.icon aria-hidden />
                          <span>{link.label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </Demo>
        <Demo option='surface="default", SidebarMenuSub tree'>
          <Sidebar
            className="rounded-card border border-ds-border"
            collapsible="none"
            label="Tree sidebar"
            surface="default"
          >
            <SidebarContent>
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <a href="#/options">
                        <FolderOpen aria-hidden />
                        <span>Reports</span>
                      </a>
                    </SidebarMenuButton>
                    <SidebarMenuSub tree>
                      {reportLinks.map((label) => (
                        <SidebarMenuSubItem key={label}>
                          <SidebarMenuSubButton href="#/options">
                            <span>{label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </Demo>
      </SidebarProvider>
    </Section>
  );
}

function TopNavOptions() {
  return (
    <Section title="TopNav">
      <div className="grid gap-ds-300">
        <Demo option="TopNav">
          <TopNav items={topNavItems} label="Default top nav" />
        </Demo>
        <Demo option='appearance="filled"'>
          <TopNav appearance="filled" items={topNavItems} label="Filled top nav" />
        </Demo>
        <Demo option='itemWidth="equal"'>
          <TopNav itemWidth="equal" items={topNavItems} label="Equal-width top nav" />
        </Demo>
        <Demo option='size="large"'>
          <TopNav items={topNavItems} label="Large top nav" size="large" />
        </Demo>
      </div>
    </Section>
  );
}

function PageHeaderOptions() {
  return (
    <Section title="PageHeader">
      <div className="grid gap-ds-300">
        <Demo option='size="display", descriptionSize="large"'>
          <PageHeader
            description="Every clinic, this quarter."
            descriptionSize="large"
            eyebrow="Dashboard"
            size="display"
            title="Revenue"
          />
        </Demo>
        <Demo option='descriptionSize="small"'>
          <PageHeader
            description="Updated five minutes ago."
            descriptionSize="small"
            title="Invoices"
          />
        </Demo>
      </div>
    </Section>
  );
}

function AvatarGroupOptions() {
  return (
    <Section title="AvatarGroup">
      <div className="flex flex-wrap items-start gap-ds-400">
        <Demo option='overlap="sm"'>
          <AvatarGroup aria-label="Reviewers" overlap="sm" size="sm">
            {team.map((member) => (
              <Avatar key={member.initials} size="sm">
                <AvatarFallback tone={member.tone}>{member.initials}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </Demo>
        <Demo option='overflowTone="brand"'>
          <AvatarGroup
            aria-label="Care team"
            max={3}
            overflowLabel={(count) => `+${count}`}
            overflowTone="brand"
          >
            {team.map((member) => (
              <Avatar key={member.initials}>
                <AvatarFallback tone={member.tone}>{member.initials}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </Demo>
      </div>
    </Section>
  );
}

function CopyButtonOptions() {
  return (
    <Section title="CopyButton">
      <Demo option="labelSuffix">
        <div className="flex flex-wrap gap-ds-100">
          <CopyButton
            copiedLabel="Link to the Q3 report copied"
            label="Copy link"
            labelSuffix="Q3 report"
            value="https://example.com/reports/q3"
          />
          <CopyButton
            copiedLabel="Link to the Q4 report copied"
            label="Copy link"
            labelSuffix="Q4 report"
            value="https://example.com/reports/q4"
          />
        </div>
      </Demo>
    </Section>
  );
}

function LineChartOptions() {
  return (
    <Section title="LineChart">
      <div className="grid gap-ds-300 md:grid-cols-2">
        <Demo option='dots="all"'>
          <LineChart
            data={firstHalf}
            dots="all"
            height={160}
            index="month"
            series={[{ key: "visits", label: "Visits" }]}
            title="Visits, every point marked"
          />
        </Demo>
        <Demo option='annotation, dots="last"'>
          <LineChart
            annotation={{ at: "Apr", label: "Peak" }}
            data={firstHalf}
            dots="last"
            height={160}
            index="month"
            series={[{ key: "visits", label: "Visits" }]}
            title="Visits, with the April peak"
          />
        </Demo>
        <Demo option='area="gradient"'>
          <LineChart
            area="gradient"
            data={firstHalf}
            height={160}
            index="month"
            series={[{ key: "signups", label: "Sign-ups" }]}
            title="Sign-ups per month"
          />
        </Demo>
        <Demo option='indexLabels="all"'>
          <LineChart
            data={months}
            height={160}
            index="month"
            indexLabels="all"
            series={[{ key: "visits", label: "Visits" }]}
            title="Visits, every month labeled"
          />
        </Demo>
      </div>
    </Section>
  );
}

function BarChartOptions() {
  return (
    <Section title="BarChart">
      <div className="grid gap-ds-300 md:grid-cols-2">
        <Demo option="track">
          <BarChart
            data={firstHalf}
            height={160}
            index="month"
            series={[{ key: "signups", label: "Sign-ups" }]}
            title="Sign-ups per month"
            track
          />
        </Demo>
        <Demo option='orientation="horizontal"'>
          <BarChart
            data={channels}
            height={160}
            index="channel"
            orientation="horizontal"
            series={[{ key: "visits", label: "Visits" }]}
            title="Visits by channel"
          />
        </Demo>
        <Demo option='highlight="Apr", highlightColor="chart-3"'>
          <BarChart
            data={firstHalf}
            height={160}
            highlight="Apr"
            highlightColor="chart-3"
            index="month"
            series={[{ key: "signups", label: "Sign-ups" }]}
            title="Sign-ups, April the best month"
            valueLabels="highlight"
          />
        </Demo>
        <Demo option='indexLabels="all"'>
          <BarChart
            data={months}
            height={160}
            index="month"
            indexLabels="all"
            series={[{ key: "signups", label: "Sign-ups" }]}
            title="Sign-ups, every month labeled"
          />
        </Demo>
      </div>
    </Section>
  );
}

function RadialProgressOptions() {
  return (
    <Section title="RadialProgress">
      <div className="flex flex-wrap items-start gap-ds-400">
        <Demo option='size="xs", color="success"'>
          <RadialProgress color="success" size="xs" title="Uptime" value={92} />
        </Demo>
        <Demo option='size={28}, valuePosition="end"'>
          <RadialProgress size={28} title="Tasks done" value={64} valuePosition="end" />
        </Demo>
        <Demo option='fill="chart-2"'>
          <RadialProgress color="chart-2" fill="chart-2" size="md" title="Booked" value={48} />
        </Demo>
        <Demo option="innerRatio={0.6}">
          <RadialProgress innerRatio={0.6} size="md" title="Quota used" value={81} />
        </Demo>
        <Demo option="interaction">
          <RadialProgress interaction label="of goal" size="lg" title="Quarter goal" value={72} />
        </Demo>
      </div>
    </Section>
  );
}

function GaugeOptions() {
  return (
    <Section title="Gauge">
      <div className="grid gap-ds-300 sm:grid-cols-2 xl:grid-cols-4">
        <Demo option="center">
          <Gauge
            center={
              <>
                <span className="text-body-sm text-ds-text-subtle">Done</span>
                <span className="text-heading-lg">72%</span>
              </>
            }
            centerLabel="Done"
            centerValue="72%"
            title="Project completion"
            value={72}
          />
        </Demo>
        <Demo option="legend={false}">
          <Gauge
            centerLabel="Projects"
            centerValue="24"
            legend={false}
            parts={projectParts}
            title="Projects by progress"
          />
          <Legend items={projectParts} />
        </Demo>
        <Demo option="innerRatio={0.5}">
          <Gauge innerRatio={0.5} title="Beds in use" value={64} />
        </Demo>
        <Demo option='segmentCaps="butt"'>
          <Gauge segmentCaps="butt" title="Staff on shift" value={58} />
        </Demo>
      </div>
    </Section>
  );
}

function ProportionBarOptions() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <Section title="ProportionBar">
      <div className="grid gap-ds-300 md:grid-cols-2">
        <Demo option='ProportionBar, fill="hatch"'>
          <ProportionBar label="Patients by species" legend segments={species} />
        </Demo>
        <Demo option="interaction={false}">
          <ProportionBar
            interaction={false}
            label="Patients by species, still"
            legend
            segments={species}
          />
        </Demo>
        <Demo option="tooltip={false}, onActiveChange">
          <div className="flex items-center gap-ds-200">
            <ProportionBar
              className="min-w-ds-0 flex-1"
              label="Patients by species, named beside"
              legend
              onActiveChange={setActive}
              segments={species}
              tooltip={false}
            />
            <p className="m-0 w-ds-1000 shrink-0 text-body-sm font-medium">
              {active === null ? "None" : species[active]?.label}
            </p>
          </div>
        </Demo>
        <Demo option="height={24}">
          <ProportionBar height={24} label="Patients by species, thick" segments={species} />
        </Demo>
      </div>
    </Section>
  );
}

function ProgressBarOptions() {
  return (
    <Section title="ProgressBar">
      <div className="grid gap-ds-300 sm:grid-cols-2 xl:grid-cols-4">
        <Demo option='track="neutral"'>
          <ProgressBar appearance="chart-1" label="Storage used" track="neutral" value={68} />
        </Demo>
        <Demo option='track="sunken"'>
          <ProgressBar appearance="chart-1" label="Storage used" track="sunken" value={68} />
        </Demo>
        <Demo option='track="hatch"'>
          <ProgressBar appearance="chart-1" label="Storage used" track="hatch" value={68} />
        </Demo>
        <Demo option='track="none"'>
          <ProgressBar appearance="chart-1" label="Storage used" track="none" value={68} />
        </Demo>
        <Demo option="height={24}">
          <ProgressBar height={24} label="Upload" value={42} />
        </Demo>
        <Demo option="parts">
          <ProgressBar label="Sprint tasks" parts={sprintParts} />
          <Legend items={sprintParts} />
        </Demo>
        <Demo option="parts, gap">
          <ProgressBar gap label="Sprint tasks" parts={sprintParts} />
          <Legend items={sprintParts} />
        </Demo>
      </div>
    </Section>
  );
}

/**
 * One demo of each documented kit option that no product screen sets yet (DESIGN_SYSTEM.md
 * section 11.1), under the theme and mode of the wrapping element.
 */
export function OptionsSpecimen() {
  return (
    <div className="grid gap-ds-400">
      <p className="m-0 text-body text-ds-text-subtle">
        Each demo sets the kit option that its caption names.
      </p>
      <ButtonOptions />
      <FilterMenuOptions />
      <CardOptions />
      <CardTitleOptions />
      <StatCardOptions />
      <BadgeOptions />
      <SearchTriggerOptions />
      <SegmentedControlOptions />
      <NavUserOptions />
      <BannerOptions />
      <CheckboxOptions />
      <TableOptions />
      <AppSidebarOptions />
      <SidebarOptions />
      <TopNavOptions />
      <PageHeaderOptions />
      <AvatarGroupOptions />
      <CopyButtonOptions />
      <LineChartOptions />
      <BarChartOptions />
      <RadialProgressOptions />
      <GaugeOptions />
      <ProportionBarOptions />
      <ProgressBarOptions />
    </div>
  );
}
