import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductDiscovery } from "@/components/chat/product-discovery";

describe("product discovery", () => {
  it("shows exact tool-backed category results without implying purchase approval", () => {
    render(<ProductDiscovery products={[{
      slug: "air-purifier-room-index",
      name: "Air purifier room index",
      description: "Current clean-air delivery and filter comparison.",
      category: "home",
      price: 95,
      currency: "USD",
    }]} />);

    expect(screen.getByRole("region", { name: "Catalog products" })).toHaveTextContent("Air purifier room index");
    expect(screen.getByText("$95.00")).toBeInTheDocument();
    expect(screen.getByText(/Browsing does not approve a purchase/i)).toBeInTheDocument();
  });

  it("renders each catalog result as a named, visually scannable product card", () => {
    render(<ProductDiscovery products={[{
      slug: "air-purifier-room-index",
      name: "Air purifier room index",
      description: "Current clean-air delivery and filter comparison.",
      category: "home",
      price: 95,
      currency: "USD",
    }]} />);

    const product = screen.getByRole("article", { name: "Air purifier room index" });
    expect(product).toHaveTextContent("Home");
    expect(product).toHaveTextContent("$95.00");
    expect(product).toHaveTextContent("Catalog record");
  });

  it("identifies the catalog search that produced the displayed records", () => {
    render(<ProductDiscovery
      products={[{
        slug: "air-purifier-room-index",
        name: "Air purifier room index",
        description: "Current clean-air delivery and filter comparison.",
        category: "home",
        price: 95,
        currency: "USD",
      }]}
      activity={[{
        type: "catalog_search",
        category: "home",
        query: "air purifier",
        maximumAmount: 100,
        resultSlugs: ["air-purifier-room-index"],
      }]}
    />);

    expect(screen.getByText("Catalog search")).toBeInTheDocument();
    expect(screen.getByText(/air purifier · up to \$100\.00/i)).toBeInTheDocument();
  });

  it("makes the agent's comparison evidence visible with the product cards", () => {
    render(<ProductDiscovery
      products={[{
        slug: "air-purifier-room-index",
        name: "Air purifier room index",
        description: "Current clean-air delivery and filter comparison.",
        category: "home",
        price: 95,
        currency: "USD",
      }]}
      activity={[{
        type: "product_comparison",
        requestedSlugs: ["air-purifier-room-index"],
        resultSlugs: ["air-purifier-room-index"],
      }]}
    />);

    expect(screen.getByText("Compared 1 catalog product")).toBeInTheDocument();
  });
});
