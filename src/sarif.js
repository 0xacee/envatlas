const RULES = {
  E001: {
    id: "E001",
    name: "undocumented-environment-variable",
    shortDescription: { text: "Referenced environment variable is absent from every catalog" },
    defaultConfiguration: { level: "error" },
    helpUri: "https://github.com/0xacee/envatlas#design-boundaries",
  },
  W001: {
    id: "W001",
    name: "unused-catalog-entry",
    shortDescription: { text: "Catalog entry has no static reference" },
    defaultConfiguration: { level: "warning" },
    helpUri: "https://github.com/0xacee/envatlas#configuration",
  },
  W002: {
    id: "W002",
    name: "duplicate-catalog-entry",
    shortDescription: { text: "Environment variable is declared more than once in a catalog" },
    defaultConfiguration: { level: "warning" },
    helpUri: "https://github.com/0xacee/envatlas#detectors",
  },
};

export function toSarif(result) {
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "EnvAtlas",
          informationUri: "https://github.com/0xacee/envatlas",
          semanticVersion: "0.1.0",
          rules: Object.values(RULES),
        },
      },
      originalUriBaseIds: {
        ROOTPATH: { uri: "file:///" },
      },
      results: result.findings.map((finding) => ({
        ruleId: finding.code,
        level: finding.severity === "error" ? "error" : "warning",
        message: { text: `${finding.name}: ${finding.message}` },
        locations: finding.locations.map((location) => ({
          physicalLocation: {
            artifactLocation: {
              uri: location.file.split("\\").join("/"),
              uriBaseId: "ROOTPATH",
            },
            region: { startLine: location.line },
          },
        })),
      })),
    }],
  };
}
