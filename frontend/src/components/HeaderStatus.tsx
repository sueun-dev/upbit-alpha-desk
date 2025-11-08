import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../api/client';
import type { ListingCalendarResponse } from '../api/types';

const HeaderStatus = () => {
  const calendarQuery = useQuery<ListingCalendarResponse>({
    queryKey: ['listingCalendar'],
    queryFn: api.getListingCalendar,
    refetchInterval: 1000 * 60 * 30
  });

  const statusText = calendarQuery.data ? buildSchedulerStatus(calendarQuery.data) : null;

  return (
    <div className="header-status">
      <div className="status-copy">
        <p className="eyebrow">최근 상장 캘린더</p>
        <p className="status-text">{statusText || '캘린더를 준비 중입니다.'}</p>
      </div>
      <div className="status-pill">3개월</div>
    </div>
  );
};

function buildSchedulerStatus(snapshot: ListingCalendarResponse) {
  const { status, lastUpdated, nextUpdateAt } = snapshot;
  const statusLabel =
    status === 'running' ? '갱신 중' : status === 'error' ? '오류' : '대기 중';
  const updatedText = lastUpdated
    ? `최근 ${format(new Date(lastUpdated), 'MM월 dd일 HH:mm')}`
    : '초기 로딩';
  const nextText = nextUpdateAt
    ? ` · 다음 ${format(new Date(nextUpdateAt), 'MM월 dd일 HH:mm')}`
    : '';
  return `${statusLabel} · ${updatedText}${nextText}`;
}

export default HeaderStatus;
