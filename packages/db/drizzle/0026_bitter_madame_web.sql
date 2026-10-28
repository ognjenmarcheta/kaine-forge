CREATE TABLE "billing_customers" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(16) NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"provider" varchar(16) NOT NULL,
	"event_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"plan_key" varchar(32) NOT NULL,
	"interval" varchar(8) NOT NULL,
	"status" varchar(32) NOT NULL,
	"quantity" integer NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_customers_provider_customer_id_idx" ON "billing_customers" USING btree ("provider","provider_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_id_idx" ON "billing_subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_organization_id_idx" ON "billing_subscriptions" USING btree ("organization_id");