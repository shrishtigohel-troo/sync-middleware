export function connectionOf(nodes) {
  return {
    edges: nodes.map((node, i) => ({ node, cursor: String(i) })),
    pageInfo: { hasNextPage: false, endCursor: null },
  };
}

export function buildVariant(overrides = {}) {
  return {
    id: "gid://shopify/ProductVariant/1",
    sku: "SKU-1",
    title: "Default Title",
    price: "19.99",
    ...overrides,
  };
}

export function buildMetafield(overrides = {}) {
  return { namespace: "custom", key: "brand", value: "Acme", type: "single_line_text_field", ...overrides };
}

export function buildProduct(overrides = {}) {
  return {
    id: "gid://shopify/Product/1",
    title: "Test Product",
    descriptionHtml: "<p>Hello <b>world</b></p>",
    handle: "test-product",
    status: "ACTIVE",
    onlineStoreUrl: "https://example.myshopify.com/products/test-product",
    featuredImage: { url: "https://cdn.shopify.com/image.jpg" },
    tags: [],
    collections: connectionOf([]),
    variants: connectionOf([buildVariant()]),
    metafields: connectionOf([]),
    ...overrides,
  };
}

export function buildCustomer(overrides = {}) {
  return {
    id: "gid://shopify/Customer/1",
    email: "jane@example.com",
    firstName: "Jane",
    lastName: "Doe",
    phone: null,
    locale: "en-US",
    createdAt: "2026-01-01T00:00:00Z",
    defaultAddress: null,
    ...overrides,
  };
}

export function buildCompany(overrides = {}) {
  return {
    id: "gid://shopify/Company/1",
    name: "Acme Corp",
    note: "Key account",
    createdAt: "2026-01-01T00:00:00Z",
    locations: connectionOf([]),
    contacts: connectionOf([]),
    ...overrides,
  };
}

export function buildLineItem(overrides = {}) {
  return {
    id: "gid://shopify/LineItem/1",
    title: "Hat",
    quantity: 2,
    sku: "SKU-1",
    variant: { id: "gid://shopify/ProductVariant/1" },
    originalUnitPriceSet: { shopMoney: { amount: "19.99", currencyCode: "USD" } },
    discountedTotalSet: { shopMoney: { amount: "39.98", currencyCode: "USD" } },
    ...overrides,
  };
}

export function buildOrder(overrides = {}) {
  return {
    id: "gid://shopify/Order/1",
    name: "#1001",
    createdAt: "2026-01-01T00:00:00Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    cancelledAt: null,
    currentTotalPriceSet: { shopMoney: { amount: "39.98", currencyCode: "USD" } },
    customer: { id: "gid://shopify/Customer/1" },
    purchasingEntity: null,
    lineItems: connectionOf([buildLineItem()]),
    ...overrides,
  };
}
