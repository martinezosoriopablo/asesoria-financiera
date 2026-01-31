// components/pdf/PortfolioComparisonPDF.tsx

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ============================================================
// INTERFACES
// ============================================================

interface Fund {
  name: string;
  provider: string;
  total_expense_ratio: number;
  return_1y?: number;
  return_3y?: number;
}

interface AllocationComparison {
  regionLabel: string;
  neutralPercent: number;
  amount: number;
  currentFund: Fund | null;
  proposedFund: Fund | null;
  costSavings: number;
  returnImprovement: number;
}

interface AssetClassData {
  name: string;
  totalPercent: number;
  allocations: AllocationComparison[];
}

interface PDFData {
  clientName?: string;
  clientEmail?: string;
  totalInvestment: number;
  assetClasses: AssetClassData[];
  totals: {
    costSavings: number;
    returnImprovement: number;
    totalBenefit: number;
  };
  generatedDate: string;
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
  },
  
  // Header
  header: {
    marginBottom: 30,
    borderBottom: "2 solid #1e293b",
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 5,
  },
  
  // Client Info
  clientInfo: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
  },
  clientRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  clientLabel: {
    fontSize: 10,
    color: "#64748b",
    width: 100,
  },
  clientValue: {
    fontSize: 10,
    color: "#1e293b",
    fontWeight: "bold",
  },
  
  // Summary Box
  summaryBox: {
    marginBottom: 25,
    padding: 20,
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    border: "2 solid #22c55e",
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#15803d",
    marginBottom: 15,
    textAlign: "center",
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#15803d",
    textAlign: "center",
    marginBottom: 15,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryItemLabel: {
    fontSize: 9,
    color: "#15803d",
    marginBottom: 5,
  },
  summaryItemValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#15803d",
  },
  
  // Asset Class Section
  assetClassSection: {
    marginBottom: 20,
  },
  assetClassHeader: {
    backgroundColor: "#f1f5f9",
    padding: 10,
    marginBottom: 10,
    borderRadius: 4,
  },
  assetClassName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e293b",
  },
  assetClassPercent: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  
  // Comparison Table
  comparisonRow: {
    marginBottom: 15,
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 4,
    border: "1 solid #e2e8f0",
  },
  regionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 8,
  },
  regionSubtitle: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 10,
  },
  
  fundGrid: {
    flexDirection: "row",
    gap: 10,
  },
  fundColumn: {
    flex: 1,
  },
  fundColumnHeader: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#64748b",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  fundName: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 3,
  },
  fundProvider: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 5,
  },
  fundMetric: {
    fontSize: 8,
    color: "#475569",
    marginBottom: 2,
  },
  
  // Benefit Box
  benefitBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#dcfce7",
    borderRadius: 4,
  },
  benefitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  benefitLabel: {
    fontSize: 8,
    color: "#15803d",
  },
  benefitValue: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#15803d",
  },
  
  // Projection Section
  projectionBox: {
    marginTop: 25,
    padding: 20,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    border: "2 solid #3b82f6",
  },
  projectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e40af",
    marginBottom: 10,
    textAlign: "center",
  },
  projectionAmount: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e40af",
    textAlign: "center",
    marginBottom: 5,
  },
  projectionSubtitle: {
    fontSize: 10,
    color: "#1e40af",
    textAlign: "center",
  },
  
  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: "1 solid #e2e8f0",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: "#94a3b8",
  },
});

// ============================================================
// COMPONENT
// ============================================================

export const PortfolioComparisonPDF = ({ data }: { data: PDFData }) => {
  const formatCurrency = (amount: number) => {
    return `$${Math.round(amount).toLocaleString("es-CL")}`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Comparación de Portafolio</Text>
          <Text style={styles.subtitle}>
            Análisis personalizado de costos y rentabilidades
          </Text>
        </View>

        {/* Client Info */}
        {(data.clientName || data.clientEmail) && (
          <View style={styles.clientInfo}>
            {data.clientName && (
              <View style={styles.clientRow}>
                <Text style={styles.clientLabel}>Cliente:</Text>
                <Text style={styles.clientValue}>{data.clientName}</Text>
              </View>
            )}
            {data.clientEmail && (
              <View style={styles.clientRow}>
                <Text style={styles.clientLabel}>Email:</Text>
                <Text style={styles.clientValue}>{data.clientEmail}</Text>
              </View>
            )}
            <View style={styles.clientRow}>
              <Text style={styles.clientLabel}>Inversión Total:</Text>
              <Text style={styles.clientValue}>
                {formatCurrency(data.totalInvestment)}
              </Text>
            </View>
            <View style={styles.clientRow}>
              <Text style={styles.clientLabel}>Fecha:</Text>
              <Text style={styles.clientValue}>{data.generatedDate}</Text>
            </View>
          </View>
        )}

        {/* Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>💰 Beneficio Total Anual</Text>
          <Text style={styles.summaryAmount}>
            {formatCurrency(data.totals.totalBenefit)}
          </Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Ahorro en Costos</Text>
              <Text style={styles.summaryItemValue}>
                {formatCurrency(data.totals.costSavings)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Mejor Rentabilidad</Text>
              <Text style={styles.summaryItemValue}>
                {formatCurrency(data.totals.returnImprovement)}
              </Text>
            </View>
          </View>
        </View>

        {/* Asset Classes */}
        {data.assetClasses.map((assetClass, idx) => (
          <View key={idx} style={styles.assetClassSection}>
            <View style={styles.assetClassHeader}>
              <Text style={styles.assetClassName}>{assetClass.name}</Text>
              <Text style={styles.assetClassPercent}>
                {assetClass.totalPercent.toFixed(1)}% del portafolio
              </Text>
            </View>

            {assetClass.allocations.map((allocation, allocIdx) => (
              <View key={allocIdx} style={styles.comparisonRow}>
                <Text style={styles.regionTitle}>{allocation.regionLabel}</Text>
                <Text style={styles.regionSubtitle}>
                  {allocation.neutralPercent.toFixed(1)}% • {formatCurrency(allocation.amount)}
                </Text>

                <View style={styles.fundGrid}>
                  {/* Current Fund */}
                  <View style={styles.fundColumn}>
                    <Text style={styles.fundColumnHeader}>Fondo Actual</Text>
                    {allocation.currentFund ? (
                      <>
                        <Text style={styles.fundName}>
                          {allocation.currentFund.name}
                        </Text>
                        <Text style={styles.fundProvider}>
                          {allocation.currentFund.provider}
                        </Text>
                        <Text style={styles.fundMetric}>
                          TER: {formatPercent(allocation.currentFund.total_expense_ratio)}
                        </Text>
                        {allocation.currentFund.return_1y !== undefined && (
                          <Text style={styles.fundMetric}>
                            Rent 1Y: {formatPercent(allocation.currentFund.return_1y)}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.fundMetric}>No seleccionado</Text>
                    )}
                  </View>

                  {/* Proposed Fund */}
                  <View style={styles.fundColumn}>
                    <Text style={styles.fundColumnHeader}>Fondo Propuesto</Text>
                    {allocation.proposedFund ? (
                      <>
                        <Text style={styles.fundName}>
                          {allocation.proposedFund.name}
                        </Text>
                        <Text style={styles.fundProvider}>
                          {allocation.proposedFund.provider}
                        </Text>
                        <Text style={styles.fundMetric}>
                          TER: {formatPercent(allocation.proposedFund.total_expense_ratio)}
                        </Text>
                        {allocation.proposedFund.return_1y !== undefined && (
                          <Text style={styles.fundMetric}>
                            Rent 1Y: {formatPercent(allocation.proposedFund.return_1y)}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.fundMetric}>No seleccionado</Text>
                    )}
                  </View>
                </View>

                {/* Benefits */}
                {allocation.currentFund && allocation.proposedFund && (
                  <View style={styles.benefitBox}>
                    <View style={styles.benefitRow}>
                      <Text style={styles.benefitLabel}>Ahorro en costos:</Text>
                      <Text style={styles.benefitValue}>
                        {formatCurrency(allocation.costSavings)}/año
                      </Text>
                    </View>
                    <View style={styles.benefitRow}>
                      <Text style={styles.benefitLabel}>Mejor rentabilidad:</Text>
                      <Text style={styles.benefitValue}>
                        {allocation.returnImprovement > 0 ? "+" : ""}
                        {formatCurrency(allocation.returnImprovement)}/año
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        {/* Projection */}
        <View style={styles.projectionBox}>
          <Text style={styles.projectionTitle}>Proyección a 10 años</Text>
          <Text style={styles.projectionAmount}>
            {formatCurrency(data.totals.totalBenefit * 10)}
          </Text>
          <Text style={styles.projectionSubtitle}>
            Beneficio acumulado en una década
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generado por Stonex Advisory • {data.generatedDate}
          </Text>
          <Text style={styles.footerText}>Página 1 de 1</Text>
        </View>
      </Page>
    </Document>
  );
};
