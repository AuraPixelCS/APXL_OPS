"use client"

import { TriangleAlertIcon } from "lucide-react"
import { FilterTabs } from "@/components/common/filter-tabs"
import {
  AreaField,
  SaveBar,
  SectionCard,
  TextField,
} from "@/components/settings/form-bits"
import { useSettingsForm } from "@/components/settings/use-settings-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { NextStep, ReplyMode } from "@/lib/settings"

export function AssistantSettings() {
  const f = useSettingsForm("assistant", "Assistant settings")
  const step = f.values.nextStep

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          title="How replies go out"
          description="The assistant reads every reply from a lead and writes an answer."
        >
          <FilterTabs<ReplyMode>
            value={f.values.replyMode}
            onChange={(v) => f.set("replyMode", v)}
            label="Reply mode"
            options={[
              { value: "approve", label: "Approve every reply" },
              { value: "auto", label: "Send automatically" },
            ]}
          />
          {f.values.replyMode === "approve" ? (
            <p className="text-sm text-muted-foreground">
              Drafts wait on the lead&rsquo;s page until you approve or edit
              them. Nothing reaches a lead without your click.
            </p>
          ) : (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                The assistant will email leads without anyone checking first.
                Switch to this only once its drafts have been right for a while.
              </AlertDescription>
            </Alert>
          )}
        </SectionCard>

        <SectionCard
          title="Next step"
          description="Where the assistant steers interested leads."
        >
          <FilterTabs<NextStep>
            value={step}
            onChange={(v) => f.set("nextStep", v)}
            label="Next step"
            options={[
              { value: "call", label: "Book a call" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "either", label: "Either" },
            ]}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            {step !== "whatsapp" && (
              <TextField
                label="Booking link"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={f.values.bookingUrl}
                onChange={(v) => f.set("bookingUrl", v)}
                error={f.errors.bookingUrl}
                helper="Calendly or Google Calendar link. Empty: the assistant offers to arrange a call."
              />
            )}
            {step !== "call" && (
              <TextField
                label="WhatsApp number"
                inputMode="tel"
                value={f.values.whatsapp}
                onChange={(v) => f.set("whatsapp", v)}
                error={f.errors.whatsapp}
              />
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="What the assistant knows"
        description="Everything it can say about AuraPixel. It won't claim anything that isn't here."
      >
        <AreaField
          label="About AuraPixel"
          rows={18}
          value={f.values.knowledge}
          onChange={(v) => f.set("knowledge", v)}
          error={f.errors.knowledge}
          max={20000}
          helper="Started from the website assistant's knowledge, rewritten for email."
        />
      </SectionCard>

      <SectionCard
        title="How it writes"
        description="Tone and rules, one per line."
      >
        <AreaField
          label="Rules"
          rows={8}
          value={f.values.rules}
          onChange={(v) => f.set("rules", v)}
          error={f.errors.rules}
          max={5000}
        />
      </SectionCard>

      <SaveBar
        dirty={f.dirty}
        saving={f.saving}
        onSave={f.save}
        onDiscard={f.discard}
        saved={f.remote.saved}
        updatedAt={f.remote.updatedAt}
        updatedBy={f.remote.updatedBy}
      />
    </div>
  )
}
