import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, Play, ArrowLeft } from 'lucide-react';
import type { Question, Quiz } from '../../../src/types';

export function HostCreate() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('My Quiz');
  const [questions, setQuestions] = useState<Question[]>([createEmptyQuestion()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function createEmptyQuestion(): Question {
    return {
      id: crypto.randomUUID(),
      text: '',
      answers: ['', '', '', ''],
      correctIndex: 0,
      timerSeconds: 20,
      doublePoints: false,
    };
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
      if (!q.text.trim()) {
        setError(`Question ${i + 1} is empty`);
        return;
      }
      if (q.answers.some((a) => !a.trim())) {
        setError(`Question ${i + 1} has empty answers`);
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

  return (
    <div className="min-h-screen p-4 pb-24">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate({ to: '/' })}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <h1 className="text-4xl font-bold text-white mb-8">Create Quiz</h1>

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

            <input
              type="text"
              value={question.text}
              onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange mb-4"
              placeholder="Enter question text"
            />

            <div className="grid grid-cols-2 gap-3 mb-4">
              {['Red', 'Blue', 'Yellow', 'Green'].map((color, aIndex) => (
                <div key={aIndex} className="relative">
                  <input
                    type="text"
                    value={question.answers[aIndex]}
                    onChange={(e) => updateAnswer(qIndex, aIndex, e.target.value)}
                    className={`w-full rounded-lg px-4 py-3 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white ${
                      aIndex === 0 ? 'bg-answer-red' :
                      aIndex === 1 ? 'bg-answer-blue' :
                      aIndex === 2 ? 'bg-answer-yellow' : 'bg-answer-green'
                    }`}
                    placeholder={`Answer ${aIndex + 1}`}
                  />
                  <button
                    onClick={() => updateQuestion(qIndex, { correctIndex: aIndex as 0|1|2|3 })}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      question.correctIndex === aIndex
                        ? 'bg-white border-white'
                        : 'border-white/50'
                    }`}
                  >
                    {question.correctIndex === aIndex && (
                      <span className="text-answer-green text-sm">✓</span>
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
                  onChange={(e) => updateQuestion(qIndex, { timerSeconds: Number(e.target.value) as 5|10|20 })}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                  <option value={20}>20 seconds</option>
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
