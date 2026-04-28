import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Home } from "./Home";

describe("Home", () => {
  it("renders the competition highlight cards", () => {
    const html = renderToStaticMarkup(<Home />);

    assert.match(html, /比赛亮点/);
    assert.match(html, /AI Pipeline/);
    assert.match(html, /Human Review/);
    assert.match(html, /自动交付/);
  });
});
