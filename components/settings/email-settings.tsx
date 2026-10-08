"use client"

import { MailIcon } from "lucide-react"
import {
  AreaField,
  SaveBar,
  SectionCard,
  TextField,
} from "@/components/settings/form-bits"
import { useSettingsForm } from "@/components/settings/use-settings-form"
import { renderIntro } from "@/lib/settings"

const SAMPLE_NAME = "Aisyah"

export function EmailSettings() {
  const f = useSettingsForm("email", "Email settings")
  const preview = renderIntro(f.values, SAMPLE_NAME)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard
            title="Sender"
            description="Who intro emails come from, and where replies go."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Sender name"
                value={f.values.senderName}
                onChange={(v) => f.set("senderName", v)}
                error={f.errors.senderName}
                helper="Shown as the “From” name in their inbox."
              />
              <TextField
                label="Email address"
                type="email"
                inputMode="email"
                value={f.values.address}
                onChange={(v) => f.set("address", v)}
                error={f.errors.address}
                helper="Emails are sent from it and replies come back to it, so it must be a real aurapixel.live mailbox."
              />
            </div>
            <AreaField
              label="Signature"
              rows={4}
              value={f.values.signature}
              onChange={(v) => f.set("signature", v)}
              error={f.errors.signature}
              max={1000}
              helper="Added wherever an email says {signature}."
            />
          </SectionCard>

          <SectionCard
            title="Intro email"
            description="The first email every new lead gets. It goes out only when you press Send intros."
          >
            <TextField
              label="Subject"
              value={f.values.introSubject}
              onChange={(v) => f.set("introSubject", v)}
              error={f.errors.introSubject}
            />
            <AreaField
              label="Message"
              rows={14}
              value={f.values.introBody}
              onChange={(v) => f.set("introBody", v)}
              error={f.errors.introBody}
              max={5000}
              helper={
                <>
                  <code className="font-mono">{"{name}"}</code> becomes the
                  lead&rsquo;s name (&ldquo;there&rdquo; when the name looks
                  fake). <code className="font-mono">{"{signature}"}</code>{" "}
                  becomes your signature.
                </>
              }
            />
          </SectionCard>
        </div>

        <aside
          className="min-w-0 xl:sticky xl:top-[4.5rem] xl:self-start"
          aria-label="Intro email preview"
        >
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3 text-sm font-medium">
              <MailIcon className="size-4 text-muted-foreground" aria-hidden />
              Preview for a lead called {SAMPLE_NAME}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b px-5 py-3 text-sm">
              <dt className="text-muted-foreground">From</dt>
              <dd className="min-w-0 break-words">
                {f.values.senderName} &lt;{f.values.address}&gt;
              </dd>
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="min-w-0 font-medium break-words">
                {preview.subject}
              </dd>
            </dl>
            <p className="px-5 py-4 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {preview.body}
            </p>
          </div>
        </aside>
      </div>

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
