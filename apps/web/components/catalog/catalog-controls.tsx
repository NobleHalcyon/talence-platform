"use client";

import { useState } from "react";

import {
  Button,
  ButtonLink,
  Checkbox,
  FilterDrawer,
  FormField,
  NumberInput,
  SearchInput,
  Select,
  TextInput,
} from "@talence/ui";

import {
  catalogHref,
  catalogQueryToSearchParams,
  DEFAULT_CATALOG_LANGUAGE,
} from "@/features/catalog/query";
import type { CatalogSearchQuery } from "@/features/catalog/types";

import styles from "./catalog.module.css";

function HiddenQueryFields({ query, exclude }: { query: CatalogSearchQuery; exclude: string[] }) {
  const parameters = catalogQueryToSearchParams(query, { cursor: null });
  return Array.from(parameters.entries())
    .filter(([name]) => !exclude.includes(name))
    .map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
}

function activeFilterCount(query: CatalogSearchQuery): number {
  return [
    query.setCode,
    query.language !== DEFAULT_CATALOG_LANGUAGE,
    query.rarity,
    query.finish,
    query.colors.length > 0,
    query.colorIdentity.length > 0,
    query.typeLine,
    query.manaValueMin !== null,
    query.manaValueMax !== null,
    query.priceAvailability !== "any",
    query.currency,
    query.includeDigital,
    query.includeNondefault,
    query.releasedFrom,
    query.releasedTo,
  ].filter(Boolean).length;
}

function FilterFields({ query, prefix }: { query: CatalogSearchQuery; prefix: string }) {
  return (
    <>
      <div className={styles.filterGrid}>
        <FormField inputId={`${prefix}-set`} label="Set code">
          <TextInput
            name="set"
            defaultValue={query.setCode}
            maxLength={32}
            autoCapitalize="characters"
            placeholder="LEA"
          />
        </FormField>
        <FormField
          inputId={`${prefix}-language`}
          label="Language code"
          hint='English is the default. Enter "all" to include every language.'
        >
          <TextInput
            name="lang"
            defaultValue={query.language}
            maxLength={16}
            autoCapitalize="none"
            placeholder="en"
          />
        </FormField>
        <FormField inputId={`${prefix}-rarity`} label="Rarity">
          <Select name="rarity" defaultValue={query.rarity}>
            <option value="">Any rarity</option>
            <option value="common">Common</option>
            <option value="uncommon">Uncommon</option>
            <option value="rare">Rare</option>
            <option value="mythic">Mythic</option>
            <option value="special">Special</option>
            <option value="bonus">Bonus</option>
          </Select>
        </FormField>
        <FormField inputId={`${prefix}-finish`} label="Finish available">
          <Select name="finish" defaultValue={query.finish}>
            <option value="">Any finish</option>
            <option value="nonfoil">Nonfoil</option>
            <option value="foil">Foil</option>
            <option value="etched">Etched</option>
          </Select>
        </FormField>
        <FormField inputId={`${prefix}-color`} label="Card color">
          <Select name="colors" defaultValue={query.colors.join(",")}>
            <option value="">Any color</option>
            <option value="W">White</option>
            <option value="U">Blue</option>
            <option value="B">Black</option>
            <option value="R">Red</option>
            <option value="G">Green</option>
            <option value="C">Colorless</option>
          </Select>
        </FormField>
        <FormField inputId={`${prefix}-identity`} label="Color identity">
          <Select name="identity" defaultValue={query.colorIdentity.join(",")}>
            <option value="">Any identity</option>
            <option value="W">White</option>
            <option value="U">Blue</option>
            <option value="B">Black</option>
            <option value="R">Red</option>
            <option value="G">Green</option>
            <option value="C">Colorless</option>
          </Select>
        </FormField>
        <FormField inputId={`${prefix}-type`} label="Type line">
          <TextInput
            name="type"
            defaultValue={query.typeLine}
            maxLength={80}
            placeholder="Creature"
          />
        </FormField>
        <FormField inputId={`${prefix}-price`} label="Price availability">
          <Select name="price" defaultValue={query.priceAvailability}>
            <option value="any">Any price state</option>
            <option value="available">Price available</option>
            <option value="unavailable">Price unavailable</option>
          </Select>
        </FormField>
        <FormField inputId={`${prefix}-currency`} label="Currency">
          <Select name="currency" defaultValue={query.currency}>
            <option value="">Profile default</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="TIX">TIX</option>
          </Select>
        </FormField>
        <FormField inputId={`${prefix}-sort`} label="Sort">
          <Select name="sort" defaultValue={query.sort}>
            <option value="name">Name</option>
            <option value="newest">Newest printing</option>
            <option value="price_asc">Price, low to high</option>
            <option value="price_desc">Price, high to low</option>
          </Select>
        </FormField>
        <FormField inputId={`${prefix}-mana-min`} label="Minimum mana value">
          <NumberInput
            name="mv_min"
            defaultValue={query.manaValueMin ?? ""}
            min={0}
            max={100}
            step="0.5"
          />
        </FormField>
        <FormField inputId={`${prefix}-mana-max`} label="Maximum mana value">
          <NumberInput
            name="mv_max"
            defaultValue={query.manaValueMax ?? ""}
            min={0}
            max={100}
            step="0.5"
          />
        </FormField>
        <FormField inputId={`${prefix}-released-from`} label="Released from">
          <TextInput name="released_from" type="date" defaultValue={query.releasedFrom} />
        </FormField>
        <FormField inputId={`${prefix}-released-to`} label="Released through">
          <TextInput name="released_to" type="date" defaultValue={query.releasedTo} />
        </FormField>
      </div>
      <div className={styles.checks}>
        <Checkbox
          name="digital"
          value="1"
          label="Include digital printings"
          defaultChecked={query.includeDigital}
        />
        <Checkbox
          name="nondefault"
          value="1"
          label="Include tokens, oversized, and other nondefault objects"
          defaultChecked={query.includeNondefault}
        />
      </div>
      <div className={styles.filterFormActions}>
        <ButtonLink
          href={catalogHref(
            { ...query, cursor: null },
            {
              query: "",
              setCode: "",
              language: DEFAULT_CATALOG_LANGUAGE,
              rarity: "",
              finish: "",
              colors: [],
              colorIdentity: [],
              typeLine: "",
              manaValueMin: null,
              manaValueMax: null,
              priceAvailability: "any",
              currency: "",
              includeDigital: false,
              includeNondefault: false,
              releasedFrom: "",
              releasedTo: "",
              sort: "name",
            },
          )}
          variant="quiet"
        >
          Clear filters
        </ButtonLink>
        <Button type="submit">Apply filters</Button>
      </div>
    </>
  );
}

export function CatalogControls({ query }: { query: CatalogSearchQuery }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filterCount = activeFilterCount(query);

  return (
    <div className={styles.controls}>
      <form className={styles.searchForm} action="/app/catalog" method="get" role="search">
        <HiddenQueryFields query={query} exclude={["q", "cursor"]} />
        <FormField inputId="catalog-query" label="Search the catalog">
          <SearchInput
            name="q"
            defaultValue={query.query}
            minLength={2}
            maxLength={120}
            placeholder="Card name, rules text, or type"
          />
        </FormField>
        <Button type="submit">Search</Button>
      </form>

      <form className={styles.desktopFilters} action="/app/catalog" method="get">
        <HiddenQueryFields
          query={query}
          exclude={[
            "set",
            "lang",
            "rarity",
            "finish",
            "colors",
            "identity",
            "type",
            "mv_min",
            "mv_max",
            "price",
            "currency",
            "digital",
            "nondefault",
            "released_from",
            "released_to",
            "sort",
            "cursor",
          ]}
        />
        <FilterFields query={query} prefix="catalog-desktop" />
      </form>

      <div className={styles.mobileFilterTrigger}>
        <Button variant="secondary" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
          Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </Button>
      </div>
      <FilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        description="Narrow exact physical printings. English is the default; digital and nondefault objects remain excluded until selected."
      >
        <form className={styles.drawerFilterForm} action="/app/catalog" method="get">
          <HiddenQueryFields
            query={query}
            exclude={[
              "set",
              "lang",
              "rarity",
              "finish",
              "colors",
              "identity",
              "type",
              "mv_min",
              "mv_max",
              "price",
              "currency",
              "digital",
              "nondefault",
              "released_from",
              "released_to",
              "sort",
              "cursor",
            ]}
          />
          <FilterFields query={query} prefix="catalog-mobile" />
        </form>
      </FilterDrawer>
    </div>
  );
}
