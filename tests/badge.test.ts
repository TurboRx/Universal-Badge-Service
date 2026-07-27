import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { buildBadge, normalizeColor } from "../api/index.js";

describe("Universal Badge Service Tests", () => {
  describe("normalizeColor", () => {
    test("handles valid 6-digit hex without #", () => {
      assert.equal(normalizeColor("ffd700"), "#ffd700");
    });

    test("handles valid 6-digit hex with #", () => {
      assert.equal(normalizeColor("#ffd700"), "#ffd700");
    });

    test("handles valid 3-digit hex", () => {
      assert.equal(normalizeColor("f00"), "#f00");
    });

    test("handles CSS named colors", () => {
      assert.equal(normalizeColor("crimson"), "crimson");
      assert.equal(normalizeColor("blue"), "blue");
    });

    test("falls back to default color on invalid inputs", () => {
      assert.equal(normalizeColor("invalid_color_string", "555"), "#555");
    });
  });

  describe("buildBadge", () => {
    test("renders basic SVG with label and message", () => {
      const svg = buildBadge({
        label: "stars",
        message: "1.2k",
        color: "ffd700"
      });

      assert.ok(svg.includes("<svg"));
      assert.ok(svg.includes("stars"));
      assert.ok(svg.includes("1.2k"));
      assert.ok(svg.includes("clipPath id=\"r\""));
      assert.ok(svg.includes("fill=\"#ffd700\""));
    });

    test("renders custom labelColor and for-the-badge style", () => {
      const svg = buildBadge({
        label: "license",
        message: "MIT",
        color: "green",
        labelColor: "black",
        style: "for-the-badge"
      });

      assert.ok(svg.includes("fill=\"black\""));
      assert.ok(svg.includes("fill=\"green\""));
      assert.ok(svg.includes("LICENSE"));
      assert.ok(svg.includes("MIT"));
    });

    test("escapes XML special characters safely", () => {
      const svg = buildBadge({
        label: "<script>",
        message: "foo & bar",
        color: "red"
      });

      assert.ok(!svg.includes("<script>"));
      assert.ok(svg.includes("&lt;script&gt;"));
      assert.ok(svg.includes("foo &amp; bar"));
    });
  });
});
