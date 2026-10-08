// Tests lib/leads/clean.ts, grid.ts and sheets.ts. Runs on plain Node (type
// stripping), no Next needed.
//   npm test                          -> fixed cases
//   npm test -- path/to/leads.csv     -> also summarises a real export
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { cleanLead, dedupeKey, needsALook } from "../lib/leads/clean.ts"
import { cellText, findHeaderRow, gridToTab } from "../lib/leads/grid.ts"
import {
  clientKeyOf,
  guessClient,
  titleFromFile,
  validateSheetDetails,
} from "../lib/leads/sheets.ts"

type Case = { in: Record<string, string>; expect: Record<string, unknown> }
const cases: Case[] = [
  {
    in: {
      full_name: "aisyah binti rahman",
      email: "Aisyah@Contoh.com.my",
      phone_number: "p:012-000 1234",
    },
    expect: {
      name: "Aisyah Binti Rahman",
      email: "aisyah@contoh.com.my",
      emailOk: true,
      phone: "60120001234",
      whatsappOk: true,
      workEmail: true,
      flags: [],
    },
  },
  {
    in: {
      full_name: "LEE WEI MING",
      email: "lwm@gmail.com",
      phone_number: "p:+60 11‑2000 3000",
    },
    expect: {
      name: "Lee Wei Ming",
      phone: "601120003000",
      whatsappOk: true,
      workEmail: false,
      flags: [],
    },
  },
  {
    in: { full_name: "?", email: "a@b.co", phone_number: "p:+60120001234" },
    expect: { greetingName: "there", flags: ["name_unusable"] },
  },
  {
    in: { full_name: "d3w1", email: "a@b.co", phone_number: "p:+60120001234" },
    expect: { flags: ["name_unusable"] },
  },
  {
    in: {
      full_name: "ᴠᴇʟ•ʟʏɴᴀ",
      email: "a@b.co",
      phone_number: "p:+60120001234",
    },
    expect: { flags: ["name_unusable"] },
  },
  {
    in: {
      full_name: "நித்தியா முக்கையா",
      email: "a@b.co",
      phone_number: "p:+60120001234",
    },
    expect: { greetingName: "நித்தியா முக்கையா", flags: [] },
  },
  {
    in: {
      full_name: "Laila",
      email: "admin@x.com.my / hr@x.com.my",
      phone_number: "Meeti",
    },
    expect: {
      email: "admin@x.com.my",
      whatsappOk: false,
      flags: ["email_multiple", "phone_invalid"],
    },
  },
  {
    in: { full_name: "Angel", email: "a@b.co", phone_number: "p:+6014970" },
    expect: { whatsappOk: false, flags: ["phone_invalid"] },
  },
  {
    in: { full_name: "Azira", email: "a@b.co", phone_number: "p:+6066780203" },
    expect: { whatsappOk: false, flags: ["phone_landline"] },
  },
  {
    in: { full_name: "Mark", email: "a@b.co", phone_number: "p:+66815816205" },
    expect: { whatsappOk: true, flags: ["phone_foreign"] },
  },
  {
    in: {
      full_name: "Ahmad",
      email: "ahmad@email.com",
      phone_number: "p:+60120001234",
    },
    expect: { emailOk: true, workEmail: false, flags: ["email_suspicious"] },
  },
  {
    in: {
      full_name: "Petro",
      email: "petro@gmail.com.com",
      phone_number: "p:+60120001234",
    },
    expect: { flags: ["email_suspicious"] },
  },
  {
    in: {
      full_name: "Low",
      email: "25006647@siswa.um.edu.my",
      phone_number: "p:+60120001234",
    },
    expect: { workEmail: false },
  },
  {
    in: { full_name: "No Phone", email: "a@b.co" },
    expect: { whatsappOk: false, flags: ["phone_missing"] },
  },
  {
    in: { full_name: "No Email", phone_number: "0120001234" },
    expect: { emailOk: false, flags: ["email_missing"] },
  },
  // Meta exports: separate name columns, odd header casing, form answers kept.
  {
    in: {
      "First Name": "siti",
      "Last Name": "nur",
      Email: "siti@kedai.my",
      "Phone Number": "0120001234",
      "What service do you need?": "Website",
      ad_name: "Oct leads",
    },
    expect: {
      name: "Siti Nur",
      email: "siti@kedai.my",
      extra: { "what_service_do_you_need?": "Website", ad_name: "Oct leads" },
    },
  },
]

let passed = 0
for (const c of cases) {
  const out = cleanLead(c.in) as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(c.expect)) {
    assert.deepEqual(
      out[k],
      v,
      `${JSON.stringify(c.in)} -> ${k}: got ${JSON.stringify(out[k])}`
    )
  }
  passed++
}

// Dedupe key and the "needs a look" rule.
assert.equal(dedupeKey(cleanLead({ email: "A@B.co" })), "email:a@b.co")
assert.equal(dedupeKey(cleanLead({ phone: "0120001234" })), "phone:60120001234")
assert.equal(dedupeKey(cleanLead({ full_name: "Nobody" })), null)
assert.equal(needsALook(cleanLead({ full_name: "?", email: "a@b.co" })), true)
assert.equal(
  needsALook(
    cleanLead({ full_name: "Ann", email: "a@b.co", phone: "06 678 0203" })
  ),
  false
)
passed += 5

// Spreadsheets: phones stored as numbers lose their leading 0; "E-mail" headers.
assert.equal(cleanLead({ phone: "123456789" }).phone, "60123456789")
assert.equal(cleanLead({ phone: "1123456789" }).phone, "601123456789")
assert.equal(
  cleanLead({ phone: "+1 2125551234" }).flags.includes("phone_foreign"),
  true
)
assert.equal(cleanLead({ "E-mail": "x@y.co" }).email, "x@y.co")
passed += 4

// Grid → rows: header found below title rows, blanks/repeats named, empty rows dropped.
const grid = [
  ["Skill2U leads, March", "", ""],
  ["", "", ""],
  ["Full Name", "Email", "Email"],
  ["Ann Lee", "ann@x.co", "ann2@x.co"],
  ["", "", ""],
  ["Bo Tan", "bo@x.co", ""],
]
assert.equal(findHeaderRow(grid), 2)
const tab = gridToTab("March", grid)
assert.deepEqual(tab.columns, ["Full Name", "Email", "Email (2)"])
assert.equal(tab.rows.length, 2)
assert.deepEqual(tab.rows[1], { "Full Name": "Bo Tan", Email: "bo@x.co" })
assert.deepEqual(
  gridToTab("", [
    ["Name", ""],
    ["Ann", "x"],
  ]).columns,
  ["Name", "Column 2"]
)
assert.equal(gridToTab("", []).rows.length, 0)
assert.equal(cellText(601123456789), "601123456789")
assert.equal(cellText(new Date(2026, 2, 5)), "2026-03-05")
assert.equal(cellText(new Date(2026, 2, 5, 14, 30)), "2026-03-05 14:30")
assert.equal(cellText(null), "")
passed += 10

// Sheet titles and clients.
assert.equal(
  titleFromFile("Skill2U_Leads_March-2026.xlsx"),
  "Skill2U Leads March-2026"
)
assert.equal(titleFromFile("leads.xlsx", "Week 1"), "leads – Week 1")
assert.equal(clientKeyOf("  Skill2U   Academy "), "skill2u academy")
assert.equal(
  guessClient("skill2u-march.csv", ["AuraPixel", "Skill2U"]),
  "Skill2U"
)
assert.equal(
  guessClient("PEOPLElogy_Summit leads.xlsx", ["People", "PEOPLElogy Summit"]),
  "PEOPLElogy Summit"
)
assert.equal(guessClient("march.csv", ["Skill2U"]), null)
assert.deepEqual(validateSheetDetails({ title: " ", client: "" }), {
  ok: false,
  errors: {
    title: "Give this sheet a title.",
    client: "Which client are these leads for?",
  },
})
assert.deepEqual(
  validateSheetDetails({ title: " March ", client: "Skill2U " }),
  {
    ok: true,
    title: "March",
    client: "Skill2U",
  }
)
passed += 8
console.log(`clean: ${passed} checks passed`)

const csvPath = process.argv[2]
if (csvPath) {
  const [header, ...lines] = readFileSync(csvPath, "utf8").trim().split(/\r?\n/)
  const cols = header.split(",")
  const leads = lines.map((l) =>
    cleanLead(Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])))
  )
  const keys = new Set(leads.map(dedupeKey).filter(Boolean))
  console.log(`\n${csvPath}`)
  console.log(`  rows ${leads.length}, unique people ${keys.size}`)
  console.log(
    `  can email ${leads.filter((l) => l.emailOk).length}, needs a look ${leads.filter(needsALook).length}, company emails ${leads.filter((l) => l.workEmail).length}`
  )
}
