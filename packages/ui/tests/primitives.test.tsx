import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  Button,
  CardImage,
  Combobox,
  DataTable,
  Drawer,
  FormField,
  IconButton,
  PriceDisplay,
  QuantityStepper,
  Switch,
  TextInput,
  Tooltip,
} from "../src";

describe("Talence primitives", () => {
  it("exposes a real label for form controls", () => {
    render(
      <FormField inputId="email" label="Email address" hint="Invitees only.">
        <TextInput id="email" type="email" />
      </FormField>,
    );

    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.getByText("Invitees only.")).toBeVisible();
  });

  it("does not render a missing price as zero", () => {
    render(<PriceDisplay observation={null} />);

    expect(screen.getByText("Price unavailable")).toBeVisible();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows provider, observation time, and staleness with an estimate", () => {
    render(
      <PriceDisplay
        now={new Date("2026-07-27T00:00:00Z")}
        observation={{
          amount: "12.50",
          currency: "USD",
          finish: "foil",
          provider: "Scryfall",
          observedAt: "2026-07-25T12:00:00Z",
          ingestedAt: "2026-07-25T12:30:00Z",
          staleAfter: "2026-07-26T12:00:00Z",
        }}
      />,
    );

    expect(screen.getByText("$12.50")).toBeVisible();
    expect(screen.getByText(/Scryfall estimate/)).toBeVisible();
    expect(screen.getByText("Estimate may be stale")).toBeVisible();
  });

  it("gives image fallbacks an accessible identity", () => {
    render(<CardImage alt="Front face of Black Lotus" />);

    expect(screen.getByRole("img", { name: "Front face of Black Lotus" })).toBeVisible();
  });

  it("falls back without cropping or hiding identity when an image fails", () => {
    render(
      <CardImage
        src="https://images.example.invalid/missing-card.jpg"
        alt="Front face of a test card"
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Front face of a test card" }));

    expect(screen.getByRole("img", { name: "Front face of a test card" })).toHaveTextContent(
      "Card image unavailable",
    );
  });

  it("announces busy button state without keeping the original action active", () => {
    render(<Button busy>Save inventory</Button>);

    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });

  it("uses safe button defaults and fully disables a quantity stepper", () => {
    render(
      <>
        <IconButton label="Open actions">•••</IconButton>
        <QuantityStepper value={2} onChange={() => undefined} disabled />
      </>,
    );

    expect(screen.getByRole("button", { name: "Open actions" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("group", { name: "Quantity" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Quantity" })).toBeDisabled();
  });

  it("provides native combobox, switch, and responsive table semantics", () => {
    render(
      <>
        <Combobox
          aria-label="Card name"
          options={[{ value: "Black Lotus" }, { value: "Mox Pearl" }]}
        />
        <Switch label="Include foil printings" />
        <DataTable label="Catalog results">
          <table>
            <tbody>
              <tr>
                <td>Black Lotus</td>
              </tr>
            </tbody>
          </table>
        </DataTable>
      </>,
    );

    expect(screen.getByRole("combobox", { name: "Card name" })).toHaveAttribute(
      "aria-autocomplete",
      "list",
    );
    expect(screen.getByRole("switch", { name: "Include foil printings" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Catalog results" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("switches card faces without hiding either face identity", () => {
    render(
      <CardImage
        alt="Test card"
        faces={[
          { src: "https://images.example.test/front.jpg", alt: "Front face", label: "Front" },
          { src: "https://images.example.test/back.jpg", alt: "Back face", label: "Back" },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Front face" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show next face" }));
    expect(screen.getByRole("img", { name: "Back face" })).toBeVisible();
  });

  it("associates tooltip content with the actual focusable trigger", () => {
    render(
      <Tooltip content="Opens collection actions">
        <button type="button">Actions</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("moves focus into drawers and restores it when dismissed", () => {
    function DrawerHarness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open filters
          </button>
          <Drawer open={open} onOpenChange={setOpen} title="Filters">
            <button type="button">Apply filters</button>
          </Drawer>
        </>
      );
    }

    render(<DrawerHarness />);
    const trigger = screen.getByRole("button", { name: "Open filters" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "Close drawer" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(trigger).toHaveFocus();
  });
});
