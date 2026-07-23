import type { ReactElement } from "react";
import { formatMoney } from "../app/decimal";
import { formatMinutes, formatNumber, formatPercent } from "../app/reportFormat";
import type { FilteredReport, GroupBreakdown } from "../app/types/report";
import { EmptyState } from "../ui/components/EmptyState/EmptyState";
import { ChartCard } from "./ChartCard";
import { EquityCurveChart } from "./EquityCurveChart";
import { GroupBarChart } from "./GroupBarChart";
import { MonthCalendarTable } from "./MonthCalendarTable";
import { SimplePieChart } from "./SimplePieChart";
import { StatCard } from "./StatCard";
import { TopTradesTable } from "./TopTradesTable";
import styles from "./ReportsPage.module.css";

export interface ReportMonthlyTabProps {
  report: FilteredReport | null;
  currency: string;
  monthLabel: string;
}

function bestOf(rows: GroupBreakdown[]): GroupBreakdown | undefined {
  return [...rows].sort((a, b) => Number(b.net_pnl) - Number(a.net_pnl))[0];
}

function worstOf(rows: GroupBreakdown[]): GroupBreakdown | undefined {
  return [...rows].sort((a, b) => Number(a.net_pnl) - Number(b.net_pnl))[0];
}

function formatDayLabel(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

export function ReportMonthlyTab({
  report,
  currency,
  monthLabel,
}: ReportMonthlyTabProps): ReactElement {
  if (!report) {
    return (
      <EmptyState
        title="Wybierz rok i miesiąc"
        description="Ten raport pokazuje jednomiesięczne podsumowanie wyników, jakości handlu, kalendarza dni oraz najmocniejszych i najsłabszych elementów."
      />
    );
  }

  const days = report.month_calendar;
  const bestDay = bestOf(
    days.map((d) => ({
      key: d.date,
      label: formatDayLabel(d.date),
      trade_count: d.trade_count,
      win_count: d.win_count,
      loss_count: d.loss_count,
      win_rate: null,
      net_pnl: d.net_pnl,
    })),
  );
  const worstDay = worstOf(
    days.map((d) => ({
      key: d.date,
      label: formatDayLabel(d.date),
      trade_count: d.trade_count,
      win_count: d.win_count,
      loss_count: d.loss_count,
      win_rate: null,
      net_pnl: d.net_pnl,
    })),
  );
  const bestStrategy = bestOf(report.by_strategy);
  const worstStrategy = worstOf(report.by_strategy);
  const bestInstrument = bestOf(report.by_instrument);
  const worstInstrument = worstOf(report.by_instrument);

  return (
    <div className={styles.tabContent}>
      <h3 className={styles.dimensionLabel}>{monthLabel}</h3>

      <div className={styles.statsGrid}>
        <StatCard label="Liczba transakcji" value={String(report.stats.closed_trades)} />
        <StatCard label="Zyskowne" value={String(report.stats.win_count)} tone="profit" />
        <StatCard label="Stratne" value={String(report.stats.loss_count)} tone="loss" />
        <StatCard label="Win rate" value={formatPercent(report.stats.win_rate)} />
        <StatCard
          label="P&L netto"
          value={formatMoney(report.stats.net_pnl, currency)}
          tone={Number(report.stats.net_pnl) >= 0 ? "profit" : "loss"}
        />
        <StatCard
          label="Łączna prowizja"
          value={formatMoney(report.stats.total_commission, currency)}
        />
        {/* Wynik pozycji wciąż otwartych, częściowo zamkniętych - pokazywany OSOBNO, żeby było
            widać, że nie wchodzi do "P&L netto" powyżej (sekcja 6.9). Karta pojawia się tylko,
            gdy takie pozycje w ogóle są, żeby nie zaśmiecać raportu zerem. */}
        {report.stats.partially_closed_trades > 0 && (
          <StatCard
            label={`Zrealizowane na pozycjach otwartych (${report.stats.partially_closed_trades})`}
            value={formatMoney(report.stats.partially_realized_pnl, currency)}
            tone={Number(report.stats.partially_realized_pnl) >= 0 ? "profit" : "loss"}
          />
        )}

        <StatCard
          label="Saldo początkowe"
          value={formatMoney(report.period_balance.starting_balance, currency)}
        />
        <StatCard
          label="Saldo końcowe"
          value={formatMoney(report.period_balance.ending_balance, currency)}
        />
        <StatCard
          label="Wpłaty/wypłaty"
          value={formatMoney(report.period_balance.net_cash_flow, currency)}
        />
        <StatCard
          label="Zwrot miesięczny"
          value={formatPercent(report.period_balance.return_percent)}
        />
        <StatCard label="Śr. RR" value={formatNumber(report.stats.average_r)} />
        <StatCard
          label="Expectancy/trade"
          value={formatMoney(report.stats.expectancy ?? "0", currency)}
        />

        <StatCard
          label="Śr. zysk"
          value={formatMoney(report.stats.average_win ?? "0", currency)}
          tone="profit"
        />
        <StatCard
          label="Śr. strata"
          value={formatMoney(report.stats.average_loss ?? "0", currency)}
          tone="loss"
        />
        <StatCard
          label="Najlepsza transakcja"
          value={formatMoney(report.stats.best_trade ?? "0", currency)}
          tone="profit"
        />
        <StatCard
          label="Najgorsza transakcja"
          value={formatMoney(report.stats.worst_trade ?? "0", currency)}
          tone="loss"
        />
        <StatCard
          label="Śr. czas trwania"
          value={formatMinutes(report.stats.average_trade_duration_minutes)}
        />
        <StatCard
          label="Max drawdown"
          value={formatMoney(report.stats.max_drawdown ?? "0", currency)}
        />
      </div>

      <div className={styles.chartsGrid}>
        <ChartCard title="Dzienny P&L netto" fullWidth>
          <GroupBarChart
            rows={days.map((d) => ({
              key: d.date,
              label: d.date.slice(8, 10),
              trade_count: d.trade_count,
              win_count: d.win_count,
              loss_count: d.loss_count,
              win_rate: null,
              net_pnl: d.net_pnl,
            }))}
            currency={currency}
          />
        </ChartCard>
        <ChartCard title="Skumulowany P&L">
          <EquityCurveChart points={report.equity_curve} currency={currency} />
        </ChartCard>
        <ChartCard title="Wynik wg strategii">
          <GroupBarChart rows={report.by_strategy} currency={currency} />
        </ChartCard>
        <ChartCard title="Zysk / Strata">
          <SimplePieChart
            slices={[
              { label: "Zyskowne", value: report.stats.win_count, color: "var(--color-profit)" },
              { label: "Stratne", value: report.stats.loss_count, color: "var(--color-loss)" },
              {
                label: "Bez wyniku",
                value: report.stats.breakeven_count,
                color: "var(--color-text-muted)",
              },
            ]}
          />
        </ChartCard>
        <ChartCard title="Wynik wg instrumentu">
          <GroupBarChart rows={report.by_instrument} currency={currency} />
        </ChartCard>
      </div>

      <div className={styles.chartsGrid}>
        <ChartCard title="Kalendarz miesiąca">
          <MonthCalendarTable days={days} currency={currency} />
        </ChartCard>
        <ChartCard title="Podsumowanie jakościowe">
          <dl className={styles.leaderboard}>
            <div className={styles.leaderCard}>
              <span className={styles.leaderLabel}>Najlepszy dzień</span>
              <span className={styles.leaderValue}>
                {bestDay ? `${bestDay.label} · ${formatMoney(bestDay.net_pnl, currency)}` : "—"}
              </span>
            </div>
            <div className={styles.leaderCard}>
              <span className={styles.leaderLabel}>Najgorszy dzień</span>
              <span className={styles.leaderValue}>
                {worstDay ? `${worstDay.label} · ${formatMoney(worstDay.net_pnl, currency)}` : "—"}
              </span>
            </div>
            <div className={styles.leaderCard}>
              <span className={styles.leaderLabel}>Najlepsza strategia</span>
              <span className={styles.leaderValue}>{bestStrategy?.label ?? "—"}</span>
            </div>
            <div className={styles.leaderCard}>
              <span className={styles.leaderLabel}>Najgorsza strategia</span>
              <span className={styles.leaderValue}>{worstStrategy?.label ?? "—"}</span>
            </div>
            <div className={styles.leaderCard}>
              <span className={styles.leaderLabel}>Najlepszy instrument</span>
              <span className={styles.leaderValue}>{bestInstrument?.label ?? "—"}</span>
            </div>
            <div className={styles.leaderCard}>
              <span className={styles.leaderLabel}>Najgorszy instrument</span>
              <span className={styles.leaderValue}>{worstInstrument?.label ?? "—"}</span>
            </div>
          </dl>
        </ChartCard>
      </div>

      <div className={styles.chartsGrid}>
        <ChartCard title="TOP 5 najlepszych transakcji">
          <TopTradesTable rows={report.top_best_trades} currency={currency} />
        </ChartCard>
        <ChartCard title="TOP 5 najgorszych transakcji">
          <TopTradesTable rows={report.top_worst_trades} currency={currency} />
        </ChartCard>
      </div>
    </div>
  );
}
