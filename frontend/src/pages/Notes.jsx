import { Globe, Link2, Play, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import api from '../services/api';
import agentApi from '../services/agentApi';

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState({ title: '', content: '', tags: '' });
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [summary, setSummary] = useState('');
  const [noteFile, setNoteFile] = useState(null);
  const [agentResult, setAgentResult] = useState(null);
  const [agentSavedId, setAgentSavedId] = useState(null);
  const [agentError, setAgentError] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tutorInput, setTutorInput] = useState('');
  const [tutorReply, setTutorReply] = useState('');
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [historyPayload, setHistoryPayload] = useState(null);

  const load = () => api.get(`/notes?search=${encodeURIComponent(search)}`).then((res) => setNotes(res.data.notes));
  useEffect(() => { load(); }, [search]);

  const handleHistoryClick = (savedNote) => {
    let parsedContent = null;

    if (typeof savedNote.content === 'string') {
      try {
        parsedContent = JSON.parse(savedNote.content);
      } catch (error) {
        parsedContent = null;
      }
    } else if (savedNote.content && typeof savedNote.content === 'object') {
      parsedContent = savedNote.content;
    }

    let normalized = null;
    if (parsedContent && parsedContent.notes_markdown) {
      normalized = {
        notes_markdown: parsedContent.notes_markdown,
        youtube_links: parsedContent.youtube_links || [],
        web_links: parsedContent.web_links || [],
        key_vocabulary: parsedContent.key_vocabulary || []
      };
    } else {
      const markdown = savedNote.content || '';
      const extracted = extractLinksFromMarkdown(markdown);
      normalized = {
        notes_markdown: markdown,
        youtube_links: extracted.youtube,
        web_links: extracted.web,
        key_vocabulary: []
      };
    }

    setHistoryPayload(normalized);
    setAgentResult(null);
    setAgentSavedId(null);
    setNoteError('');
    setActive(savedNote);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!active.title?.trim()) {
      setNoteError('Title is required.');
      return;
    }

    setIsSavingNote(true);
    setNoteError('');

    try {
      const payload = {
        title: active.title.trim(),
        content: active.content || '',
        tags: active.tags || ''
      };

      if (active.id) {
        await api.put(`/notes/${active.id}`, payload);
      } else {
        await api.post('/notes', payload);
      }

      setActive({ title: '', content: '', tags: '' });
      setHistoryPayload(null);
      load();
    } catch (error) {
      setNoteError(error?.message || 'Could not save note.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const updateActiveField = (field, value) => {
    setActive((current) => ({ ...current, [field]: value }));
  };

  const analyzeNote = async (e) => {
    e.preventDefault();
    if (!noteFile) return;

    setIsAnalyzing(true);
    setAgentError('');
    setAgentResult(null);
    setAgentSavedId(null);

    try {
      const formData = new FormData();
      formData.append('file', noteFile);

      const uploadResponse = await agentApi.post('/upload-note/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (uploadResponse.status !== 'success') {
        throw new Error(uploadResponse.error || 'Upload failed');
      }

      const analyzeResponse = await agentApi.post('/analyze-note/', {
        s3_key: uploadResponse.s3_key
      });

      if (analyzeResponse.status !== 'success') {
        throw new Error(analyzeResponse.error || 'Analysis failed');
      }

      setAgentResult(analyzeResponse.final_output);
    } catch (error) {
      setAgentError(error.message || 'Something went wrong');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveAgentNote = async () => {
    if (!agentResult?.notes_markdown) return;

    const firstLine = agentResult.notes_markdown
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) || '';
    const cleanedTitle = firstLine.replace(/^#+\s*/, '').replace(/^[-*\d.]+\s+/, '').trim();
    const title = cleanedTitle || `OCR Note ${new Date().toISOString().slice(0, 10)}`;

    const payload = {
      notes_markdown: agentResult.notes_markdown,
      youtube_links: agentResult.youtube_links || [],
      web_links: agentResult.web_links || [],
      key_vocabulary: agentResult.key_vocabulary || []
    };

    const response = await api.post('/notes', {
      title,
      content: JSON.stringify(payload),
      tags: 'ocr'
    });

    setAgentSavedId(response.data.note.id);
    load();
  };

  const deleteAgentNote = async () => {
    if (!agentSavedId) return;
    await api.delete(`/notes/${agentSavedId}`);
    setAgentSavedId(null);
    load();
  };

  const askTutor = async (e) => {
    e.preventDefault();
    if (!tutorInput.trim()) return;
    setIsTutorLoading(true);
    setTutorReply('');

    try {
      const response = await api.post('/ai/summarize', { content: tutorInput });
      setTutorReply(response.data.summary || 'No response yet.');
    } catch (error) {
      setTutorReply(error.message || 'Something went wrong.');
    } finally {
      setIsTutorLoading(false);
    }
  };

  const getDomain = (url) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (error) {
      return '';
    }
  };

  const getYouTubeId = (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1);
      if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
      const match = parsed.pathname.match(/\/shorts\/([^/]+)/);
      return match ? match[1] : '';
    } catch (error) {
      return '';
    }
  };

  const extractLinksFromMarkdown = (markdown) => {
    const youtube = [];
    const web = [];
    if (!markdown) return { youtube, web };

    const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let match = null;
    while ((match = regex.exec(markdown)) !== null) {
      const title = match[1].trim();
      const url = match[2].trim();
      const lower = url.toLowerCase();
      if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
        youtube.push({ title, url });
      } else {
        web.push({ title, url });
      }
    }

    return { youtube, web };
  };

  const displayNote = useMemo(() => {
    if (historyPayload) return historyPayload;
    if (agentResult) return agentResult;
    if (active?.content) {
      return {
        notes_markdown: active.content,
        youtube_links: [],
        web_links: [],
        key_vocabulary: []
      };
    }
    return null;
  }, [historyPayload, agentResult, active]);

  const displayTitle = useMemo(() => {
    const markdown = displayNote?.notes_markdown || '';
    const match = markdown.match(/^#{1,6}\s+(.+)$/m);
    if (match?.[1]) return match[1].trim();
    if (active?.title) return active.title;
    if (active?.updated_at || active?.created_at) {
      return new Date(active.updated_at || active.created_at).toLocaleDateString();
    }
    return displayNote ? 'Saved note' : 'Structured notes';
  }, [displayNote, active]);

  return (
    <div className="notes-page">
      <div className="notes-header">
        <div>
          <p className="notes-kicker">Study workspace</p>
          <h1 className="notes-title">Notes</h1>
        </div>
        <p className="notes-subtitle">Scan, analyze, and curate your study notes with a cleaner workflow.</p>
      </div>

      <div className="notes-shell">
        <aside className="notes-side">
          <section className="notes-upload">
            <div className="notes-upload-head">
              <div>
                <p className="notes-label">Upload</p>
                <h2 className="notes-section-title">Scan a note page</h2>
              </div>
              <div className="notes-actions">
                <Button type="submit" form="notes-upload-form" disabled={isAnalyzing || !noteFile}>
                  {isAnalyzing ? 'Analyzing...' : 'Analyze note'}
                </Button>
                {agentResult && (
                  <Button type="button" variant="secondary" onClick={() => setAgentResult(null)}>
                    Clear result
                  </Button>
                )}
                {isAnalyzing && (
                  <span className="notes-status">
                    <span className="notes-spinner" aria-hidden="true" />
                    Processing scan...
                  </span>
                )}
              </div>
            </div>
            <form id="notes-upload-form" onSubmit={analyzeNote} className="notes-dropzone" aria-label="Upload note">
              <input
                className="notes-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setNoteFile(e.target.files?.[0] || null)}
                required
              />
              <div>
                <p className="notes-drop-title">Drag & drop a scan here</p>
                <p className="notes-drop-sub">or click to choose a file (PNG, JPG, PDF).</p>
                {noteFile && <p className="notes-drop-file">Selected: {noteFile.name}</p>}
              </div>
            </form>
            {agentError && <p className="notes-error">{agentError}</p>}
          </section>
        </aside>

        <main className="notes-main">
          <section className="notes-output">
            <div className="notes-output-head">
              <div>
                <p className="notes-label">Editor</p>
                <h2 className="notes-section-title">{active.id ? 'Edit note' : 'Create note'}</h2>
              </div>
              <div className="notes-actions">
                {active.id && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setActive({ title: '', content: '', tags: '' });
                      setHistoryPayload(null);
                      setNoteError('');
                    }}
                  >
                    New note
                  </Button>
                )}
              </div>
            </div>

            <form onSubmit={save} className="notes-sheet grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Title"
                  value={active.title || ''}
                  onChange={(e) => updateActiveField('title', e.target.value)}
                  placeholder="Note title"
                  required
                />
                <Input
                  label="Tags"
                  value={active.tags || ''}
                  onChange={(e) => updateActiveField('tags', e.target.value)}
                  placeholder="study, exam, revision"
                />
              </div>
              <label className="grid gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                Content
                <textarea
                  className="input min-h-56"
                  value={active.content || ''}
                  onChange={(e) => updateActiveField('content', e.target.value)}
                  placeholder="Write your note here..."
                />
              </label>
              {noteError && <p className="notes-error">{noteError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {active.id ? 'Editing a saved note.' : 'Create a new note, then click history items to edit them later.'}
                </p>
                <Button type="submit" disabled={isSavingNote}>
                  {isSavingNote ? 'Saving...' : active.id ? 'Update note' : 'Create note'}
                </Button>
              </div>
            </form>
          </section>

          <section className="notes-output">
            <div className="notes-output-head">
              <div>
                <p className="notes-label">Generated</p>
                <h2 className="notes-section-title">{displayTitle}</h2>
              </div>
              {agentResult && !historyPayload && (
                <div className="notes-actions">
                  <Button type="button" onClick={saveAgentNote} disabled={!!agentSavedId}>
                    {agentSavedId ? 'Saved to notes' : 'Save to notes'}
                  </Button>
                  {agentSavedId && (
                    <Button type="button" variant="secondary" onClick={deleteAgentNote}>
                      Delete saved note
                    </Button>
                  )}
                </div>
              )}
              {historyPayload && active.id && (
                <div className="notes-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      api.delete(`/notes/${active.id}`).then(() => {
                        setActive({ title: '', content: '', tags: '' });
                        setHistoryPayload(null);
                        load();
                      })
                    }
                  >
                    <Trash2 size={16} />{' '}Delete note
                  </Button>
                </div>
              )}
            </div>
            <div className="notes-sheet">
              <div className="notes-render">
                {displayNote?.notes_markdown ? (
                  <ReactMarkdown>{displayNote.notes_markdown}</ReactMarkdown>
                ) : (
                  <p className="notes-placeholder">Upload a note or select one from history to view it here.</p>
                )}
              </div>
            </div>
            {!!displayNote?.key_vocabulary?.length && (
              <div className="notes-glossary">
                <p className="notes-label">Glossary</p>
                <div className="notes-glossary-grid">
                  {displayNote.key_vocabulary.map((item, index) => (
                    <div key={`${item.term}-${index}`} className="notes-glossary-item">
                      <strong>{item.term}</strong>
                      <span>{item.definition}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="notes-sources">
              <div className="notes-sources-section">
                <div className="notes-aside-head">
                  <Play size={16} />
                  <p>YouTube Links</p>
                </div>
                <div className="notes-cards">
                  {displayNote?.youtube_links?.length ? (
                    displayNote.youtube_links.map((item, index) => {
                      const videoId = getYouTubeId(item.url);
                      const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
                      return (
                        <a key={`${item.url}-${index}`} className="notes-media" href={item.url} target="_blank" rel="noreferrer">
                          <div className="notes-media-thumb">
                            {thumbnail ? <img src={thumbnail} alt="" /> : <Play size={20} />}
                          </div>
                          <div>
                            <p className="notes-media-title">{item.title}</p>
                            <p className="notes-media-meta">youtube.com</p>
                          </div>
                        </a>
                      );
                    })
                  ) : (
                    <p className="notes-empty">No videos yet.</p>
                  )}
                </div>
              </div>

              <div className="notes-sources-section">
                <div className="notes-aside-head">
                  <Link2 size={16} />
                  <p>Web Links</p>
                </div>
                <div className="notes-cards">
                  {displayNote?.web_links?.length ? (
                    displayNote.web_links.map((item, index) => {
                      const domain = getDomain(item.url);
                      const favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
                      return (
                        <a key={`${item.url}-${index}`} className="notes-resource" href={item.url} target="_blank" rel="noreferrer">
                          <div className="notes-resource-icon">
                            {favicon ? <img src={favicon} alt="" /> : <Globe size={18} />}
                          </div>
                          <div>
                            <p className="notes-media-title">{item.title}</p>
                            <p className="notes-media-meta">{domain}</p>
                          </div>
                        </a>
                      );
                    })
                  ) : (
                    <p className="notes-empty">No links yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside className="notes-sidebar">
          <div className="notes-sidebar-head">
            <p className="notes-label">History</p>
            <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="notes-list">
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => handleHistoryClick(note)}
                className={`notes-item ${active.id === note.id ? 'notes-item-active' : ''}`}
              >
                <div>
                  <p className="notes-item-title">{note.title}</p>
                  <p className="notes-item-date">{new Date(note.updated_at || note.created_at).toLocaleDateString()}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
