import Link from "next/link";

import { PublicHeader } from "@/components/public/public-header";

import styles from "./page.module.css";

const capabilities = [
  {
    index: "01",
    title: "Catalog precision",
    description:
      "Separate oracle identity from exact printings, faces, finishes, languages, and set details.",
  },
  {
    index: "02",
    title: "Auditable inventory",
    description:
      "Every quantity change is a transaction, preserving a clear history instead of silently rewriting a balance.",
  },
  {
    index: "03",
    title: "Deck ownership",
    description:
      "Build at oracle level while understanding owned, preferred, and missing quantities across selected collections.",
  },
  {
    index: "04",
    title: "Machine ready",
    description:
      "Grant registered devices narrow collection access through versioned, replay-safe contracts.",
  },
] as const;

const betaSteps = [
  {
    title: "Receive an invitation",
    copy: "Talence is intentionally closed while the private beta is operated and measured.",
  },
  {
    title: "Establish your workspace",
    copy: "A personal workspace and default collection are provisioned through the managed admission flow.",
  },
  {
    title: "Work from one catalog",
    copy: "The browser and approved devices share stable catalog identity without sharing robot execution state.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <PublicHeader />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroInner}>
            <div>
              <p className={styles.eyebrow}>Private beta · MTG collection system</p>
              <h1 className={styles.title} id="hero-title">
                Know every card. Trust every change.
              </h1>
              <p className={styles.lede}>
                Talence is a precise, mobile-first catalog, collection, and deck instrument built
                for collectors—and for the machines that help them work.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryCta} href="/login">
                  Sign in to Talence
                </Link>
                <a className={styles.secondaryCta} href="#capabilities">
                  Explore the system
                </a>
                <p className={styles.betaNote}>
                  Access requires an administrator-issued invitation.
                </p>
              </div>
            </div>

            <aside className={styles.instrument} aria-label="Talence system overview">
              <header className={styles.instrumentHeader}>
                <span className={styles.instrumentTitle}>Workspace overview</span>
                <span className={styles.instrumentStatus}>Consistent</span>
              </header>
              <div className={styles.instrumentBody}>
                <div className={styles.metricGrid}>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Catalog identity</span>
                    <span className={styles.metricValue}>Exact</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Inventory history</span>
                    <span className={styles.metricValue}>Immutable</span>
                  </div>
                </div>
                <dl className={styles.signalList}>
                  <div className={styles.signal}>
                    <dt>Price context</dt>
                    <dd>Source + freshness</dd>
                  </div>
                  <div className={styles.signal}>
                    <dt>Device updates</dt>
                    <dd>Idempotent</dd>
                  </div>
                  <div className={styles.signal}>
                    <dt>Robot execution</dt>
                    <dd>Local authority</dd>
                  </div>
                </dl>
              </div>
            </aside>
          </div>
        </section>

        <section className={styles.section} id="capabilities" aria-labelledby="capabilities-title">
          <header className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>One trustworthy workflow</p>
            <h2 className={styles.sectionTitle} id="capabilities-title">
              Collection management with clear boundaries.
            </h2>
            <p className={styles.sectionLead}>
              The cloud owns identity, catalog, inventory, decks, and accepted machine updates.
              Hardware remains safe and independent at the edge.
            </p>
          </header>
          <div className={styles.capabilities}>
            {capabilities.map((capability) => (
              <article className={styles.capability} key={capability.index}>
                <span className={styles.capabilityIndex}>{capability.index}</span>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.beta} id="private-beta" aria-labelledby="private-beta-title">
          <div className={styles.betaInner}>
            <div>
              <p className={styles.sectionEyebrow}>Controlled admission</p>
              <h2 className={styles.betaTitle} id="private-beta-title">
                Private by design while the foundation is proven.
              </h2>
              <p className={styles.betaCopy}>
                There is no public registration or anonymous catalog. Admission is linked to an
                invitation, and mutable resources stay scoped to a workspace.
              </p>
            </div>
            <ol className={styles.betaSteps}>
              {betaSteps.map((step, index) => (
                <li className={styles.betaStep} key={step.title}>
                  <span className={styles.betaStepNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{step.title}</strong>
                    <span>{step.copy}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© 2026 Talence · Private-beta platform</span>
          <nav className={styles.footerLinks} aria-label="Legal">
            <a href="#private-beta">Private beta</a>
            <a href="mailto:support@talence.example">Support</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
