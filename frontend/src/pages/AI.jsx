import { CheckCircle2, ListTodo, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import NotesContextPanel from '../components/ai/NotesContextPanel';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import api from '../services/api';
import agentApi from '../services/agentApi';

const STUDY_CHAT_KEY = 'studypal_ai_study_chat';
const TASK_CHAT_KEY = 'studypal_ai_task_chat';

function loadStoredChat(storageKey) {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function AI() {
  const [message, setMessage] = useState('');
  const [studyChat, setStudyChat] = useState(() => loadStoredChat(STUDY_CHAT_KEY));
  const [taskChat, setTaskChat] = useState(() => loadStoredChat(TASK_CHAT_KEY));
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [mode, setMode] = useState('study');
  const [taskReply, setTaskReply] = useState('');
  const [createdTasks, setCreatedTasks] = useState([]);
  const [taskError, setTaskError] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    localStorage.setItem(STUDY_CHAT_KEY, JSON.stringify(studyChat));
  }, [studyChat]);

  useEffect(() => {
    localStorage.setItem(TASK_CHAT_KEY, JSON.stringify(taskChat));
  }, [taskChat]);

  const postTaskAssistant = async (text, history) => {
    const token = localStorage.getItem('studypal_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return agentApi.post('/task/assistant', { message: text, history }, { headers });
  };

  const ask = async (e) => {
    e.preventDefault();
    const text = message;
    setMessage('');
    setTaskError('');
    setTaskReply('');
    setCreatedTasks([]);
    setIsThinking(true);

    if (mode === 'study') {
      const conversationHistory = studyChat.map((item) => ({
        role: item.role === 'ai' ? 'assistant' : 'user',
        content: item.text
      }));
      setStudyChat((items) => [...items, { role: 'you', text }]);

      const payload = { message: text };
      payload.conversationHistory = conversationHistory;
      if (selectedNotes.length > 0) {
        payload.contextNotes = selectedNotes;
      }

      try {
        const res = await api.post('/ai/chat', payload);
        setStudyChat((items) => [...items, { role: 'ai', text: res.data.reply }]);
      } catch (error) {
        setStudyChat((items) => [...items, { role: 'ai', text: error?.message || 'Could not get a response.' }]);
      } finally {
        setIsThinking(false);
      }
      return;
    }

    const taskHistory = taskChat.map((item) => ({
      role: item.role === 'ai' ? 'assistant' : 'user',
      content: item.text
    }));
    setTaskChat((items) => [...items, { role: 'you', text }]);

    try {
      const res = await postTaskAssistant(text, taskHistory);
      setTaskReply(res.reply || 'Task plan ready.');
      setCreatedTasks(res.created_tasks || []);
    } catch (error) {
      setTaskError(error?.message || 'Could not generate task plan.');
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Assistant</h1>
          <p className="text-gray-500 dark:text-gray-400">Study help, task planning, and next-step suggestions in one place.</p>
        </div>
        <div className="flex rounded-2xl border border-slate-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setMode('study')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'study' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
          >
            <Send size={16} />
            Study Help
          </button>
          <button
            type="button"
            onClick={() => setMode('tasks')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === 'tasks' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
          >
            <ListTodo size={16} />
            Task Planner
          </button>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          {mode === 'study' ? (
            <>
              <div className="grid min-h-[420px] content-start gap-3">
                {studyChat.map((item, index) => <div key={index} className={`max-w-[80%] rounded-2xl p-3 text-sm ${item.role === 'you' ? 'ml-auto bg-primary text-white' : 'bg-slate-100 dark:bg-gray-950'}`}>{item.text}</div>)}
                {isThinking && (
                  <div className="max-w-[80%] rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary align-middle" />
                    AI is thinking...
                  </div>
                )}
              </div>
              <form onSubmit={ask} className="mt-4 flex gap-3">
                <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask for study help..." required disabled={isThinking} />
                <Button disabled={isThinking}>{isThinking ? 'Thinking...' : <Send size={16} />}</Button>
              </form>
            </>
          ) : (
            <>
              <div className="grid min-h-[280px] content-start gap-3">
                {taskChat.map((item, index) => (
                  <div key={index} className={`max-w-[80%] rounded-2xl p-3 text-sm ${item.role === 'you' ? 'ml-auto bg-primary text-white' : 'bg-slate-100 dark:bg-gray-950'}`}>
                    {item.text}
                  </div>
                ))}
                {isThinking && (
                  <div className="max-w-[80%] rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary align-middle" />
                    Task manager is thinking...
                  </div>
                )}
              </div>
              <div className="grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                  Describe a project idea, for example: build a landing page, finish a portfolio, or launch an assignment feature. The agent will break it into tasks and create them.
                </div>
                {taskReply && <div className="rounded-2xl bg-primary px-4 py-3 text-sm text-white">{taskReply}</div>}
                {taskError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{taskError}</div>}

                {createdTasks.length > 0 && (
                  <div className="grid gap-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Created tasks</p>
                    {createdTasks.map((task) => (
                      <div key={task.id || task.title} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 text-emerald-600 dark:text-emerald-300" size={18} />
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{task.description || 'No description provided.'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <form onSubmit={ask} className="mt-4 flex gap-3">
                <input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the project you want to break down..." required disabled={isThinking} />
                <Button disabled={isThinking}>{isThinking ? 'Thinking...' : <Send size={16} />}</Button>
              </form>
            </>
          )}
        </Card>
        {mode === 'study' ? (
          <NotesContextPanel selectedNotes={selectedNotes} onNotesChange={setSelectedNotes} />
        ) : (
          <Card>
            <div className="grid gap-3">
              <p className="text-lg font-semibold">Task Planner Tips</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">The agent will turn a project idea into a small set of tasks and create them through the CRUD API.</p>
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                Example prompt: <span className="font-medium text-gray-900 dark:text-white">Build a simple portfolio website with about, projects, and contact sections.</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
