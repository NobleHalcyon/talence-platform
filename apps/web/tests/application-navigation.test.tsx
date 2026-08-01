import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/shell/account-menu";
import { BottomNavigation, DesktopNavigation } from "@/components/shell/primary-navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/catalog",
}));

vi.mock("@/features/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/features/settings/actions", () => ({
  setActiveWorkspaceAction: vi.fn(),
}));

const WORKSPACES = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Main workspace" },
  { id: "10000000-0000-4000-8000-000000000002", name: "Trade workspace" },
];

describe("application navigation", () => {
  it("keeps only catalog work surfaces in the primary navigation", () => {
    render(
      <>
        <DesktopNavigation />
        <BottomNavigation />
      </>,
    );

    for (const navigationName of ["Primary navigation", "Mobile navigation"]) {
      const navigation = screen.getByRole("navigation", { name: navigationName });
      expect(
        within(navigation)
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["Catalog", "Collections", "Decks"]);
      expect(within(navigation).queryByText("Dashboard")).not.toBeInTheDocument();
      expect(within(navigation).queryByText("Devices")).not.toBeInTheDocument();
      expect(within(navigation).queryByText("Settings")).not.toBeInTheDocument();
    }
  });

  it("opens the account submenu in the requested order and restores focus on Escape", () => {
    render(
      <AccountMenu
        initials="TC"
        isPlatformAdmin
        profileName="Taylor Carpenter"
        currentWorkspaceId={WORKSPACES[0]!.id}
        workspaces={WORKSPACES}
        signedIn
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Open account menu for Taylor Carpenter",
    });
    fireEvent.click(toggle);

    const submenu = screen.getByRole("dialog", { name: "Account menu" });
    expect(within(submenu).getByRole("combobox", { name: "Workspace" })).toHaveValue(
      WORKSPACES[0]!.id,
    );
    expect(
      Array.from(submenu.querySelectorAll("label, a, button"), (item) => item.textContent?.trim()),
    ).toEqual(["Workspace", "Devices", "Admin", "Settings", "Log Out"]);
    expect(
      within(submenu).getByRole("button", { name: "Log Out" }).querySelector("svg"),
    ).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Account menu" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("does not expose the admin route to a non-admin account", () => {
    render(
      <AccountMenu
        initials="TC"
        isPlatformAdmin={false}
        profileName="Taylor Carpenter"
        currentWorkspaceId={WORKSPACES[0]!.id}
        workspaces={WORKSPACES}
        signedIn
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open account menu/ }));
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });
});
