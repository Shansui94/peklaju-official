export interface ProductTier {
    qty: string;
    price: string;
}

export interface Product {
    sku: string;
    name: string;
    category: string; // ✨ 修改了这里：现在你可以随意写任何分类名称，系统都不会报错了！
    tiers: ProductTier[];
    description: string;
}

export const products: Product[] = [
    // --- 1. 气泡膜 ---
    {
        sku: "BW-SL-C-100",
        name: "Bubble Wrap Single Layer 1m x 100m (Clear)",
        category: "Bubble Wrap",
        tiers: [
            { qty: "1 - 9 Packs", price: "49.00" },
            { qty: "10 Packs", price: "45.00" },
            { qty: "20 Packs", price: "44.00" },
            { qty: "82 Packs", price: "40.00" }
        ],
        description: "高品质透明气泡膜，防震保护，适合大部分电商产品包装。"
    },
    // --- 2. 拉伸膜 ---
    {
        sku: "SF-C-2.2",
        name: "Stretch Film 2.2KG Clear (23 Micron)",
        category: "Stretch Film",
        tiers: [
            { qty: "1-9 Cartons", price: "96.00" },
            { qty: "10-19 Cartons", price: "93.00" },
            { qty: "20-50 Cartons", price: "88.80" },
            { qty: "1 Pallet", price: "85.80" }
        ],
        description: "高韧性透明拉伸膜，用于托盘打包或捆绑多个箱子（每箱6卷，价格为整箱价）。"
    },
    // --- 3. 胶带 ---
    {
        sku: "TAPE-CLR-80",
        name: "Clear OPP Tape (48mm x 80m)",
        category: "Packaging Tape",
        tiers: [
            { qty: "1 Carton", price: "171.84" },
            { qty: "2-3 Cartons", price: "152.64" },
            { qty: "4+ Cartons", price: "143.04" }
        ],
        description: "透明封箱胶带，足米不虚标（每箱96卷，价格为整箱价）。"
    },
    // --- 4. 快递袋 ---
    {
        sku: "CB-BLK-1730",
        name: "Courier Bag Black/Grey (17cm x 30cm)",
        category: "Courier Bag",
        tiers: [
            { qty: "1-3 Cartons", price: "2.80" },
            { qty: "4-9 Cartons", price: "2.50" },
            { qty: "10+ Cartons", price: "2.30" }
        ],
        description: "防水、防破坏封口、高承重快递袋（每卷100个，价格为单卷价）。"
    },
    // --- 5. 热敏打印纸 ---
    {
        sku: "THERMAL-A6-350",
        name: "A6 Thermal Paper Roll (100x150mm)",
        category: "Thermal Labels",
        tiers: [
            { qty: "1-3 Cartons", price: "175.20" },
            { qty: "4-9 Cartons", price: "168.00" },
            { qty: "10+ Cartons", price: "156.00" }
        ],
        description: "高清热敏面单纸，防水防油防刮（每箱24卷，每卷350张，此为整箱价）。"
    }
];
