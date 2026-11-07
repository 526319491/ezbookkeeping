import { describe, expect, it } from 'vitest';

import {
    SCHEDULED_TIME_STEP,
    getScheduledTimeDateTime,
    getScheduledTimeMinutes,
} from '@/lib/template.ts';

describe('getScheduledTimeMinutes', () => {
    it('generates all 15-minute options in a day', () => {
        const minutes = getScheduledTimeMinutes();

        expect(minutes.length).toBe(96);
        expect(minutes[0]).toBe(0);
        expect(minutes[1]).toBe(15);
        expect(minutes[minutes.length - 1]).toBe(23 * 60 + 45);

        for (const minute of minutes) {
            expect(minute % SCHEDULED_TIME_STEP).toBe(0);
        }
    });
});

describe('getScheduledTimeDateTime', () => {
    it('converts minutes of day to date time', () => {
        expect(getScheduledTimeDateTime(0).getHour()).toBe(0);
        expect(getScheduledTimeDateTime(0).getMinute()).toBe(0);
        expect(getScheduledTimeDateTime(8 * 60 + 15).getHour()).toBe(8);
        expect(getScheduledTimeDateTime(8 * 60 + 15).getMinute()).toBe(15);
        expect(getScheduledTimeDateTime(23 * 60 + 45).getHour()).toBe(23);
        expect(getScheduledTimeDateTime(23 * 60 + 45).getMinute()).toBe(45);
        expect(getScheduledTimeDateTime(13 * 60 + 30).getSecond()).toBe(0);
    });

    it('falls back to midnight for invalid minutes', () => {
        expect(getScheduledTimeDateTime(-15).getHour()).toBe(0);
        expect(getScheduledTimeDateTime(-15).getMinute()).toBe(0);
        expect(getScheduledTimeDateTime(24 * 60).getHour()).toBe(0);
        expect(getScheduledTimeDateTime(24 * 60).getMinute()).toBe(0);
    });
});
