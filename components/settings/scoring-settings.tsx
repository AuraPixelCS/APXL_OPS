"use client"

import { FlameIcon, InfoIcon, SnowflakeIcon, SunIcon } from "lucide-react"
import {
  AreaField,
  SaveBar,
  SectionCard,
} from "@/components/settings/form-bits"
import { useSettingsForm } from "@/components/settings/use-settings-form"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function ScoringSettings() {
  const f = useSettingsForm("scoring", "Lead scoring")

  return (
    <div className="flex flex-col gap-5">
      <Alert variant="info">
        <InfoIcon />
        <AlertDescription>
          After each reply, the assistant marks the lead Hot, Warm or Cold using
          these descriptions and writes one line on why. These are a starting
          draft: rewrite them to describe AuraPixel&rsquo;s best clients.
        </AlertDescription>
      </Alert>

      <SectionCard title="What each score means">
        <div className="grid gap-5 lg:grid-cols-3">
          <AreaField
            label={
              <span className="inline-flex items-center gap-1.5">
                <FlameIcon className="size-4 text-warning" aria-hidden />
                Hot
              </span>
            }
            rows={7}
            value={f.values.hot}
            onChange={(v) => f.set("hot", v)}
            error={f.errors.hot}
            max={2000}
            helper="You get an alert for these."
          />
          <AreaField
            label={
              <span className="inline-flex items-center gap-1.5">
                <SunIcon className="size-4 text-info" aria-hidden />
                Warm
              </span>
            }
            rows={7}
            value={f.values.warm}
            onChange={(v) => f.set("warm", v)}
            error={f.errors.warm}
            max={2000}
          />
          <AreaField
            label={
              <span className="inline-flex items-center gap-1.5">
                <SnowflakeIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
                Cold
              </span>
            }
            rows={7}
            value={f.values.cold}
            onChange={(v) => f.set("cold", v)}
            error={f.errors.cold}
            max={2000}
          />
        </div>
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
