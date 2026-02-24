// components/pdf/CarteraComitePDF.tsx

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================================
// INTERFACES
// ============================================================

interface CarteraPosition {
  clase: string;
  ticker: string;
  nombre: string;
  descripcionSimple?: string;
  porcentaje: number;
  justificacion: string;
}

interface CambioSugerido {
  tipo: "vender" | "reducir" | "mantener" | "aumentar" | "comprar";
  instrumento: string;
  razon: string;
}

interface CarteraData {
  contextoPerfil?: string;
  resumenEjecutivo: string;
  cartera: CarteraPosition[];
  cambiosSugeridos?: CambioSugerido[];
  riesgos: string[];
  proximosMonitorear: string[];
}

interface ClienteInfo {
  nombre: string;
  perfil: string;
  puntaje: number;
  monto?: number;
}

interface PDFProps {
  cliente: ClienteInfo;
  recomendacion: CarteraData;
  generadoEn: string;
}

// ============================================================
// STYLES
// ============================================================

const colors = {
  primary: "#1a1a1a",
  accent: "#dd6b20",
  gray: "#64748b",
  lightGray: "#f1f5f9",
  white: "#ffffff",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: colors.white,
    fontFamily: "Helvetica",
  },

  // Header
  header: {
    marginBottom: 25,
    borderBottom: `2 solid ${colors.primary}`,
    paddingBottom: 15,
  },
  logoSection: {
    marginBottom: 10,
  },
  companyName: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.primary,
    letterSpacing: 1,
  },
  reportType: {
    fontSize: 14,
    color: colors.accent,
    marginTop: 2,
  },
  headerRight: {
    position: "absolute",
    right: 0,
    top: 0,
    textAlign: "right",
  },
  dateLabel: {
    fontSize: 9,
    color: colors.gray,
  },
  dateValue: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: "bold",
  },

  // Client Box
  clientBox: {
    backgroundColor: colors.lightGray,
    padding: 15,
    borderRadius: 6,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  clientName: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.primary,
  },
  clientDetail: {
    fontSize: 10,
    color: colors.gray,
    marginTop: 3,
  },
  profileBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  profileText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: "bold",
  },
  scoreText: {
    fontSize: 8,
    color: colors.white,
    marginTop: 2,
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: 10,
    paddingBottom: 5,
    borderBottom: `1 solid ${colors.accent}`,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Executive Summary
  summaryText: {
    fontSize: 10,
    color: colors.primary,
    lineHeight: 1.6,
    textAlign: "justify",
  },

  // Cartera Table
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    fontSize: 9,
    color: colors.white,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `1 solid ${colors.lightGray}`,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  tableRowAlt: {
    backgroundColor: colors.lightGray,
  },
  tableCell: {
    fontSize: 9,
    color: colors.primary,
  },
  tableCellTicker: {
    fontSize: 10,
    fontWeight: "bold",
    color: colors.primary,
  },
  tableCellPercent: {
    fontSize: 11,
    fontWeight: "bold",
    color: colors.accent,
  },
  justificationText: {
    fontSize: 8,
    color: colors.gray,
    marginTop: 4,
    fontStyle: "italic",
  },

  // Asset Class Summary
  assetSummary: {
    flexDirection: "row",
    marginBottom: 15,
    gap: 10,
  },
  assetBox: {
    flex: 1,
    backgroundColor: colors.lightGray,
    padding: 10,
    borderRadius: 4,
    alignItems: "center",
  },
  assetLabel: {
    fontSize: 8,
    color: colors.gray,
    marginBottom: 3,
  },
  assetValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.primary,
  },

  // Risks
  riskSection: {
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 6,
    borderLeft: `3 solid ${colors.red}`,
    marginBottom: 15,
  },
  riskTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: colors.red,
    marginBottom: 8,
  },
  riskItem: {
    fontSize: 9,
    color: colors.primary,
    marginBottom: 4,
    paddingLeft: 10,
  },

  // Monitor
  monitorSection: {
    backgroundColor: "#fffbeb",
    padding: 12,
    borderRadius: 6,
    borderLeft: `3 solid ${colors.amber}`,
    marginBottom: 15,
  },
  monitorTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: colors.amber,
    marginBottom: 8,
  },
  monitorItem: {
    fontSize: 9,
    color: colors.primary,
    marginBottom: 4,
    paddingLeft: 10,
  },

  // Profile Context
  profileSection: {
    backgroundColor: "#eff6ff",
    padding: 12,
    borderRadius: 6,
    borderLeft: `3 solid #3b82f6`,
    marginBottom: 15,
  },
  profileTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1d4ed8",
    marginBottom: 8,
  },
  profileContextText: {
    fontSize: 9,
    color: colors.primary,
    lineHeight: 1.5,
  },

  // Position description
  positionDescription: {
    fontSize: 8,
    color: "#3b82f6",
    marginTop: 2,
    fontStyle: "italic",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: `1 solid ${colors.lightGray}`,
    paddingTop: 10,
  },
  footerText: {
    fontSize: 7,
    color: colors.gray,
    textAlign: "center",
  },
  disclaimer: {
    fontSize: 6,
    color: colors.gray,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 1.4,
  },
});

// ============================================================
// COMPONENT
// ============================================================

export default function CarteraComitePDF({ cliente, recomendacion, generadoEn }: PDFProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatMoney = (amount: number) => {
    return `$${amount.toLocaleString("es-CL")}`;
  };

  // Calcular totales por clase
  const totalesPorClase = recomendacion.cartera.reduce(
    (acc, pos) => {
      acc[pos.clase] = (acc[pos.clase] || 0) + pos.porcentaje;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoSection}>
            <Text style={styles.companyName}>GREYBARK RESEARCH</Text>
            <Text style={styles.reportType}>Cartera Recomendada</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.dateLabel}>Fecha de generación</Text>
            <Text style={styles.dateValue}>{formatDate(generadoEn)}</Text>
          </View>
        </View>

        {/* Client Info */}
        <View style={styles.clientBox}>
          <View>
            <Text style={styles.clientName}>{cliente.nombre}</Text>
            <Text style={styles.clientDetail}>
              Monto: {cliente.monto ? formatMoney(cliente.monto) : "No especificado"}
            </Text>
          </View>
          <View style={styles.profileBadge}>
            <Text style={styles.profileText}>{cliente.perfil}</Text>
            <Text style={styles.scoreText}>Score: {cliente.puntaje}/100</Text>
          </View>
        </View>

        {/* Profile Context */}
        {recomendacion.contextoPerfil && (
          <View style={styles.profileSection}>
            <Text style={styles.profileTitle}>Su Perfil de Inversionista</Text>
            <Text style={styles.profileContextText}>{recomendacion.contextoPerfil}</Text>
          </View>
        )}

        {/* Executive Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visión de Mercado y Recomendación</Text>
          <Text style={styles.summaryText}>{recomendacion.resumenEjecutivo}</Text>
        </View>

        {/* Asset Class Summary */}
        <View style={styles.assetSummary}>
          {Object.entries(totalesPorClase).map(([clase, total]) => (
            <View key={clase} style={styles.assetBox}>
              <Text style={styles.assetLabel}>{clase}</Text>
              <Text style={styles.assetValue}>{total}%</Text>
            </View>
          ))}
        </View>

        {/* Cartera Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Composición de Cartera</Text>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: "12%" }]}>Ticker</Text>
              <Text style={[styles.tableHeaderCell, { width: "28%" }]}>Instrumento</Text>
              <Text style={[styles.tableHeaderCell, { width: "15%" }]}>Clase</Text>
              <Text style={[styles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>%</Text>
              <Text style={[styles.tableHeaderCell, { width: "35%" }]}>Justificación</Text>
            </View>

            {/* Rows */}
            {recomendacion.cartera.map((pos, idx) => (
              <View key={pos.ticker} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                <Text style={[styles.tableCellTicker, { width: "12%" }]}>{pos.ticker}</Text>
                <View style={{ width: "28%" }}>
                  <Text style={styles.tableCell}>{pos.nombre}</Text>
                  {pos.descripcionSimple && (
                    <Text style={styles.positionDescription}>{pos.descripcionSimple}</Text>
                  )}
                </View>
                <Text style={[styles.tableCell, { width: "15%" }]}>{pos.clase}</Text>
                <Text style={[styles.tableCellPercent, { width: "10%", textAlign: "right" }]}>
                  {pos.porcentaje}%
                </Text>
                <Text style={[styles.tableCell, { width: "35%", fontSize: 8 }]}>
                  {pos.justificacion}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Cambios Sugeridos */}
        {recomendacion.cambiosSugeridos && recomendacion.cambiosSugeridos.length > 0 && (
          <View style={[styles.section, { marginBottom: 15 }]}>
            <Text style={styles.sectionTitle}>Cambios Sugeridos</Text>
            {recomendacion.cambiosSugeridos.map((cambio, idx) => (
              <View key={idx} style={{ flexDirection: "row", marginBottom: 6, alignItems: "flex-start" }}>
                <Text style={{
                  fontSize: 8,
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 3,
                  marginRight: 8,
                  backgroundColor: cambio.tipo === "vender" ? "#fee2e2" :
                                   cambio.tipo === "reducir" ? "#ffedd5" :
                                   cambio.tipo === "comprar" ? "#d1fae5" :
                                   cambio.tipo === "aumentar" ? "#dcfce7" : "#f3f4f6",
                  color: cambio.tipo === "vender" ? "#dc2626" :
                         cambio.tipo === "reducir" ? "#ea580c" :
                         cambio.tipo === "comprar" ? "#059669" :
                         cambio.tipo === "aumentar" ? "#16a34a" : "#4b5563",
                }}>
                  {cambio.tipo}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: colors.primary }}>{cambio.instrumento}</Text>
                  <Text style={{ fontSize: 8, color: colors.gray }}>{cambio.razon}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Risks */}
        <View style={styles.riskSection}>
          <Text style={styles.riskTitle}>Riesgos a Monitorear</Text>
          {recomendacion.riesgos.map((riesgo, idx) => (
            <Text key={idx} style={styles.riskItem}>• {riesgo}</Text>
          ))}
        </View>

        {/* Events to Monitor */}
        <View style={styles.monitorSection}>
          <Text style={styles.monitorTitle}>Eventos a Monitorear</Text>
          {recomendacion.proximosMonitorear.map((evento, idx) => (
            <Text key={idx} style={styles.monitorItem}>• {evento}</Text>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            GREYBARK RESEARCH | Cartera Recomendada | {formatDate(generadoEn)}
          </Text>
          <Text style={styles.disclaimer}>
            Este documento es solo para fines informativos y no constituye una recomendación de inversión personalizada.
            Las opiniones expresadas son las del Comité de Inversión a la fecha indicada y están sujetas a cambios.
            El rendimiento pasado no garantiza resultados futuros. Consulte a su asesor financiero antes de tomar decisiones.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
