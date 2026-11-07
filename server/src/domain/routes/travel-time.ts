import { ensure } from '../shared/errors';

export enum TransportMode {
  WALK = 'WALK',
  HIKE = 'HIKE',
  BIKE = 'BIKE',
  CAR = 'CAR',
}

export function isTransportMode(v: unknown): v is TransportMode {
  return typeof v === 'string' && (Object.values(TransportMode) as string[]).includes(v);
}

/** Патерн «Стратегія»: алгоритм оцінки тривалості для конкретного виду пересування. */
export interface TravelTimeStrategy {
  readonly mode: TransportMode;
  estimateMinutes(distanceKm: number): number;
}

/** Базова стратегія із середньою швидкістю та часткою часу на зупинки. */
abstract class SpeedBasedStrategy implements TravelTimeStrategy {
  abstract readonly mode: TransportMode;
  protected abstract readonly speedKmh: number;
  protected readonly restFactor: number = 1;

  estimateMinutes(distanceKm: number): number {
    ensure(Number.isFinite(distanceKm) && distanceKm >= 0, 'Відстань має бути невід\'ємним числом');
    return Math.round((distanceKm / this.speedKmh) * 60 * this.restFactor);
  }
}

/** Пішохідна прогулянка містом: 4,5 км/год. */
export class WalkingStrategy extends SpeedBasedStrategy {
  readonly mode = TransportMode.WALK;
  protected readonly speedKmh = 4.5;
}

/** Туристичний похід: 3,5 км/год і 10 % часу на відпочинок. */
export class HikingStrategy extends SpeedBasedStrategy {
  readonly mode = TransportMode.HIKE;
  protected readonly speedKmh = 3.5;
  protected readonly restFactor = 1.1;
}

/** Велосипед: 15 км/год. */
export class CyclingStrategy extends SpeedBasedStrategy {
  readonly mode = TransportMode.BIKE;
  protected readonly speedKmh = 15;
}

/** Автомобіль: 50 км/год і 10 % часу на зупинки. */
export class DrivingStrategy extends SpeedBasedStrategy {
  readonly mode = TransportMode.CAR;
  protected readonly speedKmh = 50;
  protected readonly restFactor = 1.1;
}

/** Контекст патерну «Стратегія»: обирає алгоритм за видом пересування. */
export class TravelTimeEstimator {
  private readonly strategies = new Map<TransportMode, TravelTimeStrategy>();

  constructor(strategies: TravelTimeStrategy[] = []) {
    strategies.forEach((s) => this.register(s));
  }

  /** Додавання нового виду пересування не потребує зміни наявного коду. */
  register(strategy: TravelTimeStrategy): this {
    this.strategies.set(strategy.mode, strategy);
    return this;
  }

  estimateMinutes(mode: TransportMode, distanceKm: number): number {
    const strategy = this.strategies.get(mode);
    ensure(strategy, `Немає стратегії для виду пересування ${mode}`);
    return strategy.estimateMinutes(distanceKm);
  }

  static default(): TravelTimeEstimator {
    return new TravelTimeEstimator([new WalkingStrategy(), new HikingStrategy(), new CyclingStrategy(), new DrivingStrategy()]);
  }
}
