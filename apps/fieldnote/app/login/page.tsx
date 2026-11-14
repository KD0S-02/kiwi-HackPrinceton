import { Logo } from "../../components/Logo";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <div className="login-screen">
      <section className="login-hero">
        <div>
          <div className="login-brand"><Logo size={40} /><strong>FIELDNOTE</strong></div>
          <h1>The workspace for restaurant supply.</h1>
          <p>Accounts, quotes, warehouses, and the discount rule, in one place.</p>
        </div>
        <div className="login-points">
          <span>One book of restaurants, with every buyer and usual order</span>
          <span>Quotes that stop at the discount cap until your manager, Alex Morgan, signs off</span>
          <span>Stock by warehouse, so you know what can ship</span>
        </div>
      </section>
      <section className="login-card">
        <form className="login-panel" action="/api/login" method="post">
          <h2>Sign in to Fieldnote</h2>
          <p>Use your work account to open your book.</p>
          <input type="hidden" name="next" value={next} />
          <label className="field">Work email<input name="email" defaultValue="sparsh.bohra@fieldnote.com" autoComplete="username" /></label>
          <label className="field">Password<input name="password" type="password" defaultValue="fieldnote" autoComplete="current-password" /></label>
          <button className="btn primary wide" type="submit">Sign in</button>
          <p className="login-foot">Sparsh Bohra · Account executive · Jersey City · manager: Alex Morgan</p>
        </form>
      </section>
    </div>
  );
}
