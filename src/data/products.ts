export interface ProductTier {
    qty: string;
    price: string;
}

export interface Product {
    sku: string;
    name: string;
    category: "Bubble Wrap" | "Stretch Film";
    tiers: ProductTier[];
    description: string;
}

export const products: Product[] = [
    {
        sku: "BW-SL-C-100",
        name: "Bubble Wrap Single Layer 1m x 100m (Clear)",
        category: "Bubble Wrap",
        tiers: [
            { qty: "1 Roll", price: "48.00" },
            { qty: "10 Rolls", price: "42.00" },
            { qty: "20 Rolls", price: "40.00" },
            { qty: "Bulk", price: "39.00" }
        ],
        description: "高品质气泡，防震保护，适合大部分电商产品包装。"
    },
    {
        sku: "BW-SL-B-100",
        name: "Bubble Wrap Single Layer 1m x 100m (Black)",
        category: "Bubble Wrap",
        tiers: [
            { qty: "1 Roll", price: "59.00" },
            { qty: "10 Rolls", price: "55.00" },
            { qty: "20 Rolls", price: "53.00" },
            { qty: "Bulk", price: "49.00" }
        ],
        description: "黑色膜保护隐私，外观更高档。"
    },
    {
        sku: "SF-C-2.2",
        name: "Stretch Film 2.2KG Clear (500mm, 23mic)",
        category: "Stretch Film",
        tiers: [
            { qty: "1 Roll", price: "14.00" },
            { qty: "126 Rolls", price: "13.50" },
            { qty: "432 Rolls", price: "13.00" }
        ],
        description: "用于托盘打包或捆绑多个箱子，高韧性。"
    }
];
