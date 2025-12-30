import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, Play, ArrowLeft, Save, Check, FileText, Edit3, Image, X, Upload } from 'lucide-react';
import type { Question, Quiz, SavedQuiz } from '../../../src/types';

type View = 'select' | 'edit';

export function HostCreate() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('select');
  const [title, setTitle] = useState('My Quiz');
  const [questions, setQuestions] = useState<Question[]>([createEmptyQuestion()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);

  // Load saved quizzes on mount
  useEffect(() => {
    fetchSavedQuizzes();
  }, []);

  async function fetchSavedQuizzes() {
    setLoadingQuizzes(true);
    try {
      const response = await fetch('/api/quizzes');
      if (response.ok) {
        const quizzes = await response.json() as SavedQuiz[];
        setSavedQuizzes(quizzes);
      }
    } catch {
      // Ignore errors - quizzes feature may not be available
    } finally {
      setLoadingQuizzes(false);
    }
  }

  async function handleSaveQuiz() {
    if (!title.trim()) {
      setError('Quiz title is required');
      return;
    }

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const quizId = currentQuizId || crypto.randomUUID();
      const quiz: Quiz = { 
        id: quizId, 
        title: title.trim(), 
        questions 
      };

      // Always use POST for new, PUT for existing
      const method = currentQuizId ? 'PUT' : 'POST';
      const url = currentQuizId ? `/api/quizzes/${currentQuizId}` : '/api/quizzes';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quiz),
      });

      if (response.ok) {
        const saved = await response.json() as SavedQuiz;
        setCurrentQuizId(saved.id);
        setSaveSuccess(true);
        await fetchSavedQuizzes();
        // Clear success message after 2 seconds
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        const errorData = await response.text();
        console.error('Save failed:', errorData);
        setError('Failed to save quiz. Please try again.');
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save quiz. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function selectQuiz(quiz: SavedQuiz) {
    setTitle(quiz.title);
    setQuestions(quiz.questions);
    setCurrentQuizId(quiz.id);
    setView('edit');
  }

  function startNewQuiz() {
    setTitle('My Quiz');
    setQuestions([createEmptyQuestion()]);
    setCurrentQuizId(null);
    setView('edit');
  }

  async function deleteQuiz(quizId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this quiz?')) return;

    try {
      await fetch(`/api/quizzes/${quizId}`, { method: 'DELETE' });
      await fetchSavedQuizzes();
      if (currentQuizId === quizId) {
        setCurrentQuizId(null);
      }
    } catch {
      // Ignore
    }
  }

  function createEmptyQuestion(): Question {
    return {
      id: crypto.randomUUID(),
      text: '',
      imageUrl: undefined,
      answers: ['', '', '', ''],
      correctIndices: [0],
      timerSeconds: 20,
      doublePoints: false,
    };
  }

  function toggleCorrectAnswer(questionIndex: number, answerIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex) return q;
        const indices = new Set(q.correctIndices);
        if (indices.has(answerIndex)) {
          indices.delete(answerIndex);
          // Ensure at least one answer is correct
          if (indices.size === 0) indices.add(answerIndex);
        } else {
          indices.add(answerIndex);
        }
        return { ...q, correctIndices: Array.from(indices).sort() };
      })
    );
  }

  async function handleImageUpload(questionIndex: number, file: File) {
    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (response.ok) {
        const { imageUrl } = await response.json() as { imageUrl: string };
        updateQuestion(questionIndex, { imageUrl });
      } else {
        setError('Failed to upload image');
      }
    } catch {
      setError('Failed to upload image');
    }
  }

  function removeImage(questionIndex: number) {
    updateQuestion(questionIndex, { imageUrl: undefined });
  }

  function updateQuestion(index: number, updates: Partial<Question>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updates } : q))
    );
  }

  function updateAnswer(questionIndex: number, answerIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== questionIndex) return q;
        const answers = [...q.answers] as [string, string, string, string];
        answers[answerIndex] = value;
        return { ...q, answers };
      })
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, createEmptyQuestion()]);
  }

  function removeQuestion(index: number) {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate() {
    // Validate
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim() && !q.imageUrl) {
        setError(`Question ${i + 1} needs text or an image`);
        return;
      }
      if (q.answers.some((a) => !a.trim())) {
        setError(`Question ${i + 1} has empty answers`);
        return;
      }
      if (q.correctIndices.length === 0) {
        setError(`Question ${i + 1} needs at least one correct answer`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/games', { method: 'POST' });
      const data = await response.json() as { gameId: string; gamePin: string };

      // Store quiz in sessionStorage to send via WebSocket
      const quiz: Quiz = { id: crypto.randomUUID(), title, questions };
      sessionStorage.setItem('pending_quiz', JSON.stringify(quiz));

      navigate({ to: '/host/presenter/$gameId', params: { gameId: data.gameId } });
    } catch (e) {
      setError('Failed to create game');
      setLoading(false);
    }
  }

  // Quiz selection screen
  if (view === 'select') {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate({ to: '/' })}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <h1 className="text-4xl font-bold text-white mb-8">Host a Game</h1>

          {/* Create New Quiz */}
          <button
            onClick={startNewQuiz}
            className="w-full card mb-6 hover:bg-white/20 transition-colors text-left flex items-center gap-4"
          >
            <div className="w-14 h-14 rounded-xl bg-brand-orange flex items-center justify-center">
              <Plus className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Create New Quiz</h2>
              <p className="text-gray-400">Start from scratch with a blank quiz</p>
            </div>
          </button>

          {/* Saved Quizzes */}
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Your Saved Quizzes
            </h2>

            {loadingQuizzes ? (
              <div className="card text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-brand-orange mx-auto"></div>
                <p className="text-gray-400 mt-2">Loading quizzes...</p>
              </div>
            ) : savedQuizzes.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-gray-400">No saved quizzes yet</p>
                <p className="text-gray-500 text-sm mt-1">Create a quiz and save it to reuse later</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedQuizzes.map((quiz) => (
                  <div
                    key={quiz.id}
                    className="card hover:bg-white/20 transition-colors flex items-center justify-between"
                  >
                    <button
                      onClick={() => selectQuiz(quiz)}
                      className="flex-1 text-left flex items-center gap-4"
                    >
                      <div className="w-12 h-12 rounded-lg bg-brand-gold/20 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-brand-gold" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{quiz.title}</h3>
                        <p className="text-sm text-gray-400">
                          {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''} •{' '}
                          {new Date(quiz.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => selectQuiz(quiz)}
                        className="btn bg-white/10 hover:bg-white/20 p-2"
                        title="Edit quiz"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => deleteQuiz(quiz.id, e)}
                        className="text-red-400 hover:text-red-300 p-2"
                        title="Delete quiz"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Quiz editor view
  return (
    <div className="min-h-screen p-4 pb-24">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => setView('select')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Quizzes
        </button>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-white">
            {currentQuizId ? 'Edit Quiz' : 'Create Quiz'}
          </h1>
          <button
            onClick={handleSaveQuiz}
            disabled={saving}
            className={`btn flex items-center gap-2 ${
              saveSuccess 
                ? 'bg-green-600 hover:bg-green-600' 
                : 'btn-secondary'
            }`}
          >
            {saveSuccess ? (
              <>
                <Check className="w-5 h-5" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                {saving ? 'Saving...' : 'Save Quiz'}
              </>
            )}
          </button>
        </div>

        <div className="card mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">Quiz Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange"
            placeholder="Enter quiz title"
          />
        </div>

        {questions.map((question, qIndex) => (
          <div key={question.id} className="card mb-6 relative">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-white">Question {qIndex + 1}</h3>
              {questions.length > 1 && (
                <button
                  onClick={() => removeQuestion(qIndex)}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Image Upload */}
            <div className="mb-4">
              {question.imageUrl ? (
                <div className="relative inline-block">
                  <img
                    src={question.imageUrl}
                    alt="Question"
                    className="max-h-48 rounded-lg border border-white/20"
                  />
                  <button
                    onClick={() => removeImage(qIndex)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-3 bg-white/10 border border-dashed border-white/30 rounded-lg cursor-pointer hover:bg-white/20 transition-colors">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-400">Add image (optional)</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(qIndex, file);
                    }}
                  />
                </label>
              )}
            </div>

            <input
              type="text"
              value={question.text}
              onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange mb-4"
              placeholder={question.imageUrl ? "Enter question text (optional with image)" : "Enter question text"}
            />

            {/* Multiple Choice Hint */}
            {question.correctIndices.length > 1 && (
              <p className="text-sm text-brand-gold mb-2">
                Multiple correct answers selected - players must select all to score
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              {['Red', 'Blue', 'Yellow', 'Green'].map((color, aIndex) => (
                <div key={aIndex} className="relative">
                  <input
                    type="text"
                    value={question.answers[aIndex]}
                    onChange={(e) => updateAnswer(qIndex, aIndex, e.target.value)}
                    className={`w-full rounded-lg px-4 py-3 pr-10 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white ${
                      aIndex === 0 ? 'bg-answer-red' :
                      aIndex === 1 ? 'bg-answer-blue' :
                      aIndex === 2 ? 'bg-answer-yellow' : 'bg-answer-green'
                    }`}
                    placeholder={`Answer ${aIndex + 1}`}
                  />
                  <button
                    onClick={() => toggleCorrectAnswer(qIndex, aIndex)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                      question.correctIndices.includes(aIndex)
                        ? 'bg-white border-white'
                        : 'border-white/50 hover:border-white'
                    }`}
                    title="Click to mark as correct (can select multiple)"
                  >
                    {question.correctIndices.includes(aIndex) && (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-4 flex-wrap">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Timer</label>
                <select
                  value={question.timerSeconds}
                  onChange={(e) => updateQuestion(qIndex, { timerSeconds: Number(e.target.value) as 5|10|20|30|60 })}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                  <option value={20}>20 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`double-${question.id}`}
                  checked={question.doublePoints}
                  onChange={(e) => updateQuestion(qIndex, { doublePoints: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <label htmlFor={`double-${question.id}`} className="text-gray-300">
                  Double Points
                </label>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addQuestion}
          className="w-full card border-dashed border-2 border-white/30 hover:border-white/50 flex items-center justify-center gap-2 text-gray-300 hover:text-white transition-colors py-8"
        >
          <Plus className="w-6 h-6" />
          Add Question
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-brand-dark/90 backdrop-blur-lg border-t border-white/10 p-4">
        <div className="max-w-3xl mx-auto flex justify-end">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="btn btn-primary flex items-center gap-2 text-lg"
          >
            <Play className="w-5 h-5" />
            {loading ? 'Creating...' : 'Start Game'}
          </button>
        </div>
      </div>
    </div>
  );
}
