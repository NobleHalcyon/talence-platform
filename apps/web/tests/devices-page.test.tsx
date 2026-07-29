import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DevicePage from "@/app/(authenticated)/app/devices/[deviceId]/page";
import DevicesPage from "@/app/(authenticated)/app/devices/page";
import { previewDeviceDetail, previewDeviceList } from "@/features/devices/preview";
import { PREVIEW_DEVICE_ID } from "@/features/devices/preview-constants";

const mocks = vi.hoisted(() => ({
  loadDeviceDetail: vi.fn(),
  loadDeviceList: vi.fn(),
}));

vi.mock("@/features/devices/data", () => ({
  loadDeviceDetail: mocks.loadDeviceDetail,
  loadDeviceList: mocks.loadDeviceList,
}));

describe("device administration routes", () => {
  beforeEach(() => {
    mocks.loadDeviceList.mockResolvedValue({
      ok: true,
      data: previewDeviceList("all"),
      preview: true,
    });
    mocks.loadDeviceDetail.mockResolvedValue({
      ok: true,
      data: previewDeviceDetail(PREVIEW_DEVICE_ID),
      preview: true,
    });
  });

  it("renders responsive list, lifecycle filtering, and one-time registration controls", async () => {
    render(await DevicesPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Devices" })).toBeVisible();
    expect(screen.getByText("Deterministic preview data")).toBeVisible();
    expect(screen.getByRole("link", { name: "Workshop Sorter" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Device status" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Register device and issue credential" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Device type")).toHaveValue("talence_sorter");
  });

  it("renders last-seen/catalog/prefix/grants and no remote motion command", async () => {
    render(
      await DevicePage({
        params: Promise.resolve({ deviceId: PREVIEW_DEVICE_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "Workshop Sorter", level: 1 })).toBeVisible();
    expect(screen.getByText("mtg-20260727T120000Z-a1b2c3d4-s1")).toBeVisible();
    expect(screen.getByText("abcdef123456")).toBeVisible();
    expect(screen.getByText("Main Collection")).toBeVisible();
    expect(screen.getByRole("button", { name: "Rotate credential" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /start|move|motion/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/no remote start, movement command, or robot checkpoint/i),
    ).toBeVisible();
  });

  it("renders an explicit permission state and removes all management forms for viewers", async () => {
    const data = previewDeviceList("all");
    mocks.loadDeviceList.mockResolvedValue({
      ok: true,
      data: {
        ...data,
        permissions: { canManage: false, canRegister: false, canDelete: false },
      },
      preview: false,
    });
    render(await DevicesPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("status")).toHaveTextContent("Read-only device view");
    expect(
      screen.queryByRole("button", { name: "Register device and issue credential" }),
    ).not.toBeInTheDocument();
  });
});
