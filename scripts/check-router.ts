import { route } from "../apps/desktop/router.ts";

const controls = [
  { id: "brand", label: "Fieldnote logo, home", kind: "a", disabled: false },
  { id: "", label: "Home", kind: "a", disabled: false },
  { id: "", label: "Accounts", kind: "a", disabled: false },
  { id: "", label: "Pipeline", kind: "a", disabled: false },
  { id: "", label: "Fulfillment", kind: "a", disabled: false },
  { id: "", label: "Supply", kind: "a", disabled: false },
  { id: "", label: "Company", kind: "a", disabled: false },
  { id: "", label: "Open the opportunity", kind: "a", disabled: false },
  { id: "", label: "Products 3", kind: "a", disabled: false },
  { id: "send-quote", label: "Send Quote", kind: "button", disabled: true },
  { id: "discount", label: "Discount", kind: "input", disabled: false },
  { id: "", label: "Cycle count", kind: "button", disabled: false },
];
const tabs = [{ title: "crm template - Google Search" }, { title: "Fieldnote" }, { title: "GitHub" }];

for (const question of [
  "Show me where the supply page is.",
  "open accounts",
  "take me to the pipeline",
  "open the Fieldnote tab",
  "where is the products tab",
  "where is Send Quote?",
  "why can't I send the quote?",
  "set the discount to 15",
  "send the quote",
  "what does Harbor Diner usually order?",
  "where do I log a cycle count",
  "how do I log a cycle count",
  "click the Fieldnote logo",
  "go back home by clicking the logo",
  "where is the logo",
  "click the logo and tell me what's urgent",
]) {
  const started = performance.now();
  const stop = route(question, controls, tabs, [{ id: "quote-message", text: "An account executive stops at 15 percent. Your manager, Alex Morgan, has to approve the rest." }]);
  console.log(`${(performance.now() - started).toFixed(2)}ms`, question, "=>", stop ? `${stop.kind} ${stop.target} | ${stop.say}` : "model");
}
