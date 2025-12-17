import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'chatTime',
  standalone: true,
})
export class ChatTimePipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
