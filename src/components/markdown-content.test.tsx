import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "@/components/markdown-content";

describe("MarkdownContent", () => {
  it("renders only the supported Markdown allowlist", () => {
    const { container } = render(
      <MarkdownContent>{"**粗体**\n换行\n\n- 列表\n\n`code`\n\n```js\nalert(1)\n```"}</MarkdownContent>,
    );

    expect(screen.getByText("粗体").tagName).toBe("STRONG");
    expect(container.querySelector("br")).toBeInTheDocument();
    expect(container.querySelector("ul")).toBeInTheDocument();
    expect(container.querySelector("pre code")).toHaveTextContent("alert(1)");
  });

  it("removes raw HTML, links and images without creating executable elements", () => {
    const { container } = render(
      <MarkdownContent>{"<script>alert(1)</script>\n\n[外链](https://example.com)\n\n![图片](x.png)\n\n# 标题"}</MarkdownContent>,
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("a")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector("h1")).not.toBeInTheDocument();
    expect(screen.getByText("外链")).toBeInTheDocument();
  });
});
