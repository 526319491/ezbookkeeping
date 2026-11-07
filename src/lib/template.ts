import { reversed } from '@/core/base.ts';
import { TransactionTemplate } from '@/models/transaction_template.ts';

import { getYearMonthDayTimeDateTime } from '@/lib/datetime.ts';

export const SCHEDULED_TIME_STEP = 15;

export function getScheduledTimeMinutes(): number[] {
    const minutes: number[] = [];

    for (let i = 0; i < 24 * 60; i += SCHEDULED_TIME_STEP) {
        minutes.push(i);
    }

    return minutes;
}

export function getScheduledTimeDateTime(minutes: number): ReturnType<typeof getYearMonthDayTimeDateTime> {
    let validMinutes = 0;

    if (minutes >= 0 && minutes < 24 * 60) {
        validMinutes = minutes;
    }

    return getYearMonthDayTimeDateTime(2020, 1, 1, Math.floor(validMinutes / 60), validMinutes % 60);
}

export function isNoAvailableTemplate(templates: TransactionTemplate[], showHidden: boolean): boolean {
    for (const template of templates) {
        if (showHidden || !template.hidden) {
            return false;
        }
    }

    return true;
}

export function getAvailableTemplateCount(templates: TransactionTemplate[], showHidden: boolean): number {
    let count = 0;

    for (const template of templates) {
        if (showHidden || !template.hidden) {
            count++;
        }
    }

    return count;
}

export function getFirstShowingId(templates: TransactionTemplate[], showHidden: boolean): string | null {
    for (const template of templates) {
        if (showHidden || !template.hidden) {
            return template.id;
        }
    }

    return null;
}

export function getLastShowingId(templates: TransactionTemplate[], showHidden: boolean): string | null {
    for (const template of reversed(templates)) {
        if (showHidden || !template.hidden) {
            return template.id;
        }
    }

    return null;
}
