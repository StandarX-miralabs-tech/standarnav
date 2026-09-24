/**
 * The server's answer, rendered where there is no DOM at all: Node, with no `document` global to
 * fall back on, and Angular's server platform, where after-render hooks never run. A provider
 * that built its system in its factory, or a function that read the document before the first
 * render in a browser, throws here rather than rendering, or leaves its mark in the HTML.
 */

import "@angular/compiler";
import {
  type ApplicationRef,
  Component,
  type EnvironmentProviders,
  type Provider,
  provideZonelessChangeDetection,
  type Type,
} from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideServerRendering, renderApplication } from "@angular/platform-server";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { InputPlugin } from "../input-system";
import {
  injectInputModality,
  injectInputSystem,
  injectIntent,
  injectIntentScopeHost,
  provideNav,
  provideNavDocument,
} from "./angular";

// Angular 20.3 gave the server bootstrap a context argument to pass on, and 20.0 has none:
// forwarding whatever arrives typechecks against both, as the floor job needs.
const start = bootstrapApplication as (...args: unknown[]) => Promise<ApplicationRef>;

function render(
  root: Type<unknown>,
  providers: (Provider | EnvironmentProviders)[],
): Promise<string> {
  const config = {
    providers: [provideZonelessChangeDetection(), provideServerRendering(), ...providers],
  };
  return renderApplication((...context: unknown[]) => start(root, config, ...context), {
    document: "<html><head></head><body><ssr-root></ssr-root></body></html>",
    url: "/",
  });
}

describe("the Angular adapter on a server", () => {
  let warn: MockInstance;
  let error: MockInstance;
  const setups: string[] = [];
  const recording: InputPlugin = {
    name: "recording",
    setup() {
      setups.push("setup");
      return () => {};
    },
  };
  const doc = vi.fn((): Document => {
    throw new Error("the document was read on the server");
  });

  beforeEach(() => {
    expect(typeof document).toBe("undefined");
    setups.length = 0;
    doc.mockClear();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it("renders every function's first answer with no document, and builds nothing", async () => {
    const Child = Component({
      selector: "ssr-child",
      template: `<span>{{ system() === null ? "none" : "built" }}:{{ modality() }}:{{ host !== null }}</span>`,
    })(
      class {
        readonly system = injectInputSystem();
        readonly modality = injectInputModality();
        readonly host = injectIntentScopeHost();
        constructor() {
          injectIntent(() => true, { trapped: true, within: () => null });
          this.host?.pushScope(() => true);
        }
      },
    );
    const Provider = Component({
      selector: "ssr-provider",
      imports: [Child],
      providers: provideNav({ plugins: [recording] }),
      template: "<ssr-child />",
    })(class {});
    const Orphan = Component({ selector: "ssr-orphan", template: "<i></i>" })(
      class {
        constructor() {
          injectIntent(() => true);
        }
      },
    );
    const Root = Component({
      selector: "ssr-root",
      imports: [Provider, Orphan],
      template: "<ssr-provider /><ssr-orphan />",
    })(class {});

    const html = await render(Root, [provideNavDocument(doc)]);

    expect(html).toContain("none:pointer:true");
    expect(html).not.toContain("data-snav-input");
    expect(setups).toEqual([]);
    expect(doc).not.toHaveBeenCalled();
    // The missing-provider warning belongs to a render in a browser, and there is none here.
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("builds nothing from a provider given to the application either", async () => {
    const Root = Component({
      selector: "ssr-root",
      template: `<button type="button">only</button>`,
    })(class {});

    const html = await render(Root, [
      provideNavDocument(doc),
      provideNav({ plugins: [recording] }),
    ]);

    expect(html).toContain("only");
    expect(html).not.toContain("data-snav-input");
    expect(setups).toEqual([]);
    expect(doc).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
