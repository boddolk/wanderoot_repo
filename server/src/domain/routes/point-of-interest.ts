import { ConflictError, ensure } from '../shared/errors';
import { GeoPoint } from '../shared/geo-point';
import { newId } from '../shared/ids';

export enum PoiCategory {
  HISTORY = 'HISTORY',
  NATURE = 'NATURE',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  PET_FRIENDLY = 'PET_FRIENDLY',
  OTHER = 'OTHER',
}

/** Стан поширення точки: приватна → запропонована спільноті → затверджена модератором. */
export type PoiSharing = 'PRIVATE' | 'PENDING' | 'APPROVED';

export interface PoiProps {
  id: string;
  name: string;
  description: string;
  category: PoiCategory;
  location: GeoPoint;
  sharing: PoiSharing;
}

export class PointOfInterest {
  private constructor(private props: PoiProps) {}

  static create(data: { name: string; description?: string; category?: string; lat: number; lon: number }): PointOfInterest {
    const name = (data.name ?? '').trim();
    ensure(name.length >= 1 && name.length <= 100, 'Назва точки інтересу має містити від 1 до 100 символів');
    const description = (data.description ?? '').trim();
    ensure(description.length <= 1000, 'Опис точки інтересу не може перевищувати 1000 символів');
    const category = (Object.values(PoiCategory) as string[]).includes(data.category ?? '') ? (data.category as PoiCategory) : PoiCategory.OTHER;
    return new PointOfInterest({ id: newId(), name, description, category, location: new GeoPoint(data.lat, data.lon), sharing: 'PRIVATE' });
  }

  static restore(props: PoiProps): PointOfInterest {
    return new PointOfInterest({ ...props });
  }

  get id() { return this.props.id; }
  get name() { return this.props.name; }
  get description() { return this.props.description; }
  get category() { return this.props.category; }
  get location() { return this.props.location; }
  get sharing() { return this.props.sharing; }

  suggestToCommunity(): void {
    if (this.props.sharing !== 'PRIVATE') throw new ConflictError('Точку вже запропоновано або затверджено');
    this.props.sharing = 'PENDING';
  }

  approve(): void {
    if (this.props.sharing !== 'PENDING') throw new ConflictError('Затвердити можна лише запропоновану точку');
    this.props.sharing = 'APPROVED';
  }

  reject(): void {
    if (this.props.sharing !== 'PENDING') throw new ConflictError('Відхилити можна лише запропоновану точку');
    this.props.sharing = 'PRIVATE';
  }

  toJSON() {
    return { ...this.props, location: this.props.location.toJSON() };
  }
}
