// What still blocks a quote after the discount itself is handled. The discount
// line is not here: it changes the moment Save is pressed, and the editor says so.
export function quoteNotes(input: { products: number; cases: { kind: string; status: string }[] }) {
  const notes = [
    input.products === 0 ? "no products on the quote" : "",
    input.cases.some((row) => row.status === "open" && row.kind === "delivery complaint") ? "an open delivery complaint" : "",
  ].filter(Boolean);
  return notes.length === 0 ? "Nothing else is blocking this quote." : `Still open on this restaurant: ${notes.join("; ")}.`;
}
