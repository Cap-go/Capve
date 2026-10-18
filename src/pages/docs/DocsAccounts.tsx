import { Link } from "react-router-dom";

export function DocsAccounts() {
  return (
    <>
      <h1>Accounts &amp; impersonation</h1>
      <p className="docs-lead">
        Switch between your personal account and teams you have joined. Platform
        admins can open an account for support without signing in as its owner.
      </p>
      <h2>Switch accounts</h2>
      <p>
        Open the account switcher at the top of the dashboard sidebar. It
        shows the current account and your role in it. Your personal account
        is always listed, marked Personal; a check mark shows the active one.
        With more than five accounts, type in the filter to find one. Team accounts appear after you verify your
        email and accept their invitations in Settings.
      </p>
      <p>
        The role beside each team account controls what you can do. Viewers can
        read reports; admins can edit campaign data. Owners can also manage team
        membership. Switching reloads the dashboard to clear the previous
        account's campaign selection and forms. Save your changes first.
      </p>
      <p>
        The choice persists across page reloads. Memberships and roles are
        checked on every request, so removing someone or changing their role
        takes effect without waiting for their session to expire.
      </p>
      <h2>Open an account for support</h2>
      <ol role="list">
        <li>
          Sign in with a verified platform admin account and open Admin in the
          Workspace section of the sidebar.
        </li>
        <li>
          Find the account in the user list. Use Previous and Next to browse
          additional accounts.
        </li>
        <li>
          Select Impersonate. The dashboard opens that user's personal account
          with owner access.
        </li>
        <li>
          Check the amber bar at the top of the page before changing anything.
          It names the account you are viewing and your signed-in admin email.
          The account switcher shows Support access and is locked until you
          exit.
        </li>
        <li>
          Select Exit impersonation in the amber bar to return to the account you were using
          before support access began.
        </li>
      </ol>
      <p>
        Impersonation expires after one hour. Entry and exit are recorded in{" "}
        <code>account_access_log</code> with the actor, target account, and
        time. It does not create a login session for the target user or change
        their password.
      </p>
      <h2>Session and API boundaries</h2>
      <p>
        Account switching and impersonation require a browser session. API
        tokens cannot start or stop impersonation or change the browser's
        selected account. Existing API tokens keep their existing account
        resolution; they do not follow the account switcher.
      </p>
      <p>
        While impersonating, personal API-token management and the platform
        admin APIs are unavailable. Exit support access before managing your own
        credentials. Signing out, signing in as another user, or resetting your
        password clears the selected support context.
      </p>
      <p>
        If you switch accounts in another tab, requests from a stale dashboard
        are rejected and that tab reloads. This prevents a form opened under one
        account from being saved into another.
      </p>
      <p>
        See <Link to="/docs/mcp">MCP server</Link> for personal API-token
        access.
      </p>
    </>
  );
}
