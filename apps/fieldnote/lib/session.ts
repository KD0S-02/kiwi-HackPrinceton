import { cookies } from "next/headers";
import { people, personById, type Person } from "./people";

export async function signedInUser(): Promise<Person> {
  const jar = await cookies();
  const id = jar.get("fieldnote_session")?.value ?? "";
  return personById(id) ?? people()[0];
}
