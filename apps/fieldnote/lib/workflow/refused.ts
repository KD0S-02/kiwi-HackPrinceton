// A rule said no. The message is one plain sentence: the server returns it as HTTP 400
// { error }, and the page shows the same sentence under the disabled button.
export class Refused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "Refused";
  }
}

export function refuse(reason: string): never {
  throw new Refused(reason);
}

// Throws when a check returned a reason. Checks return "" when the action is allowed.
export function must(reason: string | undefined | null) {
  if (reason) refuse(reason);
}

// Runs a check that may throw Refused, and returns its reason instead ("" when allowed).
// Pages use this to show the server's sentence before anyone clicks.
export async function why(check: () => unknown): Promise<string> {
  try {
    await check();
    return "";
  } catch (error) {
    if (error instanceof Refused) return error.message;
    throw error;
  }
}
