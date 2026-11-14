import { personById } from "../apps/fieldnote/lib/people.ts";
import { openSession } from "./graph-session.ts";

export type UserLookup = {
  id: string;
  name: string;
  role: string;
  rules: { tool: string; action: string; scope: string; allow: boolean }[];
  screens: { name: string; tab: string; where: string }[];
  org: { manager: string | null; territory: string | null; office: string | null };
};

function localPerson(userId: string): UserLookup | undefined {
  const person = personById(userId);
  if (!person) return undefined;
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    rules: [
      { tool: "fieldnote", action: "discount", scope: "15 percent", allow: false },
      { tool: "fieldnote", action: "send quote", scope: "own opportunities", allow: true },
    ],
    screens: [],
    org: { manager: person.managerName || null, territory: person.territory, office: person.office },
  };
}

export async function lookupUser(userId: string): Promise<UserLookup> {
  try {
    return await lookupFromGraph(userId);
  } catch (error) {
    const local = localPerson(userId);
    if (local) return local;
    throw error;
  }
}

async function lookupFromGraph(userId: string): Promise<UserLookup> {
  const { session, close } = openSession();
  try {
    const result = await session.run(
      `MATCH (person:Person {id: $userId})-[:HAS_ROLE]->(role:Role)
       OPTIONAL MATCH (person)-[:REPORTS_TO]->(manager:Person)
       OPTIONAL MATCH (person)-[:COVERS]->(territory:Territory)-[:BASED_AT]->(office:Office)
       OPTIONAL MATCH (role)-[:HAS_RULE]->(rule:Rule)
       OPTIONAL MATCH (control:Control)
       RETURN person, role, manager, territory, office, collect(DISTINCT rule) AS rules, collect(DISTINCT control) AS controls`,
      { userId },
    );
    const record = result.records[0];
    if (!record) {
      throw new Error(`No person ${userId}`);
    }
    const person = record.get("person").properties;
    const role = record.get("role").properties;
    const manager = record.get("manager");
    const territory = record.get("territory");
    const office = record.get("office");
    return {
      id: person.id,
      name: person.name,
      role: role.name,
      rules: record.get("rules").map((rule: { properties: UserLookup["rules"][number] }) => ({
        tool: rule.properties.tool,
        action: rule.properties.action,
        scope: rule.properties.scope,
        allow: rule.properties.allow,
      })),
      screens: record.get("controls").map((control: { properties: { name: string; module: string; where: string } }) => ({
        name: control.properties.name,
        tab: control.properties.module,
        where: control.properties.where,
      })),
      org: {
        manager: manager ? manager.properties.name : null,
        territory: territory ? territory.properties.name : null,
        office: office ? office.properties.name : null,
      },
    };
  } finally {
    await close();
  }
}

const isDirectRun = process.argv[1]?.endsWith("lookup-user.ts");
if (isDirectRun) {
  const lookup = await lookupUser(process.argv[2] ?? "user");
  console.log(JSON.stringify(lookup, null, 2));
}
