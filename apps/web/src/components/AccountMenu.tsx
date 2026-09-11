"use client";

import { Menu } from "@base-ui/react/menu";
import { useClerk } from "@clerk/nextjs";
import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { authDisabled } from "@/env";
import { useViewerProfile } from "@/lib/useViewerProfile";

/** What only Clerk owns, or null while Clerk is off (local-dev-user):
 * there is no session to open a modal for and none to tear down. */
type ClerkActions = {
  signOut: () => void;
  openUserProfile: () => void;
} | null;

/**
 * The single account control (QA 2026-07-28 — replaced Clerk's UserButton
 * plus the topbar email link, and the sidebar's Profile entry). Trigger is
 * the viewer's per-forum avatar via useViewerProfile (shared with the
 * comment composers since QA 2026-08-10). The menu keeps Clerk for what
 * only Clerk should own: "Account & security" opens its modal (email,
 * password, sessions), and sign-out goes through its session teardown —
 * both dropped, rather than dead, when Clerk is off.
 *
 * `authDisabled` is fixed for the life of the build, so this branch picks
 * one component and never swaps — a `useClerk()` with no provider above it
 * throws, and there is no conditional-hook hazard in choosing not to
 * render the thing that calls it.
 */
export function AccountMenu({ email }: { email: string | null }) {
  return authDisabled ? (
    <AccountMenuBody email={email} clerk={null} />
  ) : (
    <ClerkAccountMenu email={email} />
  );
}

function ClerkAccountMenu({ email }: { email: string | null }) {
  const { signOut, openUserProfile } = useClerk();
  return (
    <AccountMenuBody
      email={email}
      clerk={{
        signOut: () => void signOut({ redirectUrl: "/" }),
        openUserProfile: () => openUserProfile(),
      }}
    />
  );
}

function AccountMenuBody({
  email,
  clerk,
}: {
  email: string | null;
  clerk: ClerkActions;
}) {
  const profile = useViewerProfile();

  return (
    <Menu.Root>
      <Menu.Trigger className="account-trigger" aria-label="Account">
        <Avatar name={profile.name ?? email} image={profile.image} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="tt-switcher-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Menu.Popup className="tt-switcher-list account-menu">
            {email ? <div className="account-menu-email">{email}</div> : null}
            <Menu.Item
              className="tt-menu-item"
              render={
                <Link
                  href={
                    profile.slug ? `/f/${profile.slug}/profile` : "/profile"
                  }
                />
              }
            >
              Edit Profile
            </Menu.Item>
            {clerk ? (
              <>
                <Menu.Item
                  className="tt-menu-item"
                  onClick={clerk.openUserProfile}
                >
                  Account &amp; security
                </Menu.Item>
                <Menu.Item className="tt-menu-item" onClick={clerk.signOut}>
                  Sign out
                </Menu.Item>
              </>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
