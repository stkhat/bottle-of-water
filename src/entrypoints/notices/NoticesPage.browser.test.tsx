import data from "virtual:langle-notices";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-preact";
import { NoticesPage } from "./NoticesPage";

describe("NoticesPage", () => {
  it("shows every pack Langle downloads with its license and every source", async () => {
    const screen = await render(<NoticesPage data={data} />);
    expect(data.packs.length).toBeGreaterThan(5);
    for (const pack of data.packs) {
      const card = screen.getByRole("region", {
        name: pack.title,
        exact: true,
      });
      await expect.element(card).toBeVisible();
      const text = card.element().textContent;
      expect(text).toContain(pack.package);
      expect(text).toContain(pack.license.name);
      for (const source of pack.sources) {
        const link = card.getByRole("link", {
          name: source.title,
          exact: true,
        });
        await expect.element(link).toHaveAttribute("href", source.url);
        expect(text).toContain(`${source.title} · ${source.license.name}`);
        expect(text).toContain(source.used);
      }
    }
  });

  it("carries the full notices of the WordNet-style licenses", async () => {
    const screen = await render(<NoticesPage data={data} />);
    const notices = screen.getByRole("region", { name: "License notices" });
    await expect.element(notices).toBeVisible();
    expect(data.notices.map((notice) => notice.title)).toEqual(
      expect.arrayContaining([expect.stringContaining("WordNet")]),
    );
    const text = notices.element().textContent;
    for (const notice of data.notices) {
      expect(text).toContain(notice.title);
      expect(text).toContain(notice.text);
    }
  });
});
