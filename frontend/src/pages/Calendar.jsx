import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import api from '../services/api';
import { today } from '../utils/format';

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [form, setForm] = useState({ title: '', start: today(), end: '', color: '#4F46E5' });
  const navigate = useNavigate();

  const getTaskColor = (priority) => {
    if (priority === 'high') return '#DC2626';
    if (priority === 'medium') return '#F59E0B';
    if (priority === 'low') return '#16A34A';
    return '#4F46E5';
  };

  const formatTaskTooltip = (task) => {
    const details = [];
    if (task.description) details.push(task.description);
    if (task.category) details.push(`Category: ${task.category}`);
    if (task.priority) details.push(`Priority: ${task.priority}`);
    if (task.status) details.push(`Status: ${task.status}`);
    if (task.due_date) details.push(`Due: ${task.due_date}`);
    return details.join('\n');
  };

  const load = async () => {
    const [eventsRes, tasksRes] = await Promise.all([
      api.get('/events'),
      api.get('/tasks?sort=due_date')
    ]);

    const eventEntries = (eventsRes.data.events || []).map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      start: event.start,
      end: event.end,
      color: event.color,
      extendedProps: { source: 'event', eventId: event.id }
    }));

    const taskEntries = (tasksRes.data.tasks || [])
      .filter((task) => task.due_date)
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        start: task.due_date,
        allDay: true,
        color: getTaskColor(task.priority),
        extendedProps: {
          source: 'task',
          taskId: task.id,
          task
        }
      }));

    setEvents([...eventEntries, ...taskEntries]);
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    await api.post('/events', form);
    setForm({ title: '', start: today(), end: '', color: '#4F46E5' });
    load();
  };

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold">Calendar</h1>
      <Card>
        <form onSubmit={create} className="grid gap-3 md:grid-cols-[1fr_180px_180px_120px_auto]">
          <Input label="Event" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Input label="Start" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
          <Input label="End" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          <Input label="Color" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          <Button className="self-end">Add</Button>
        </form>
      </Card>
      <Card>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          events={events}
          eventMouseEnter={(info) => {
            if (info.event.extendedProps?.source !== 'task') return;
            const task = info.event.extendedProps.task || {};
            setTooltip({
              title: info.event.title,
              body: formatTaskTooltip(task),
              x: info.jsEvent.pageX,
              y: info.jsEvent.pageY
            });
          }}
          eventMouseLeave={() => setTooltip(null)}
          eventClick={(info) => {
            const source = info.event.extendedProps?.source;
            if (source === 'task') {
              navigate(`/tasks/${info.event.extendedProps.taskId}`);
              return;
            }
            api.delete(`/events/${info.event.extendedProps.eventId}`).then(load);
          }}
        />
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-gray-800 dark:bg-gray-950"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            <p className="font-semibold text-gray-900 dark:text-white">{tooltip.title}</p>
            {tooltip.body ? (
              <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-600 dark:text-gray-300">{tooltip.body}</pre>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No additional task details.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
