export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface CheckResult {
  id: string;
  category: string;
  site: string;
  name: string;
  status: CheckStatus;
  message: string;
  details?: string;
  responseTime?: number;
}

export interface SiteConfig {
  id: string;
  name: string;
  region: string;
  language: string;
  locale: string;
  url: string;
  syncWorkerUrl: string;
  currency: { code: string; symbol: string; htmlEntity: string; position: 'left' | 'left_space' | 'right_space' };
  decimalSeparator: '.' | ',';
  thousandSeparator: ',' | '.';
  cartTotalFormat: 'prefix_dot' | 'prefix_dot_de' | 'suffix_comma';
  taxPercent: number;
  isHeadless: boolean;
  paths: {
    products: string;
    collections: string;
    cart: string;
    checkout: string;
    quoteGenerator: string;
    blogs: string;
  };
  phone: string;
  hasWhatsApp?: boolean;
  emailDomain: string;
  logoPath: string;
  gtmId: string;
  searchTestQuery: string;
  benchmarkProducts: {
    attributeSimple: BenchmarkProduct;
    attributeComplex: BenchmarkProduct;
    addonSimple: BenchmarkProduct;
    addonComplex: BenchmarkProduct;
  };
  benchmarkCategories: BenchmarkCategory[];
  expectedProductCount: number;
}

export interface BenchmarkProduct {
  slug: string;
  productId: number;
  name: string;
  type: 'attribute' | 'addon';
  minimumQuantity: string;
  expectedAttributeCount?: number;
  expectedAttributes?: ExpectedAttribute[];
  expectedVariationCount?: number;
  expectedAddonCount?: number;
  expectedTopLevelAddonCount?: number;
  expectedAddons?: ExpectedAddon[];
  hasPrices: boolean;
  leadTime: string;
  madeInEurope: boolean;
  greenOption: boolean;
  madeInUk?: boolean;
}

export interface ExpectedAttribute {
  slug: string;
  displayType: string;
  termCount: number;
  termSlugs: string[];
}

export interface ExpectedAddon {
  id: number;
  name: string;
  displayType: string;
  parentId: number;
  optionCount: number;
  optionNames: string[];
}

export interface BenchmarkCategory {
  slug: string;
  name: string;
  expectedProductCount: number;
  tolerance: number;
}

export interface Report {
  timestamp: string;
  mode: 'daily' | 'deploy';
  sites: string[];
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: CheckResult[];
}
