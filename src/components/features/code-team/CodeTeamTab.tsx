'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Send, Loader2, Code2, Users, GitBranch, History, CheckCircle2, XCircle, Bot } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

// ==================== TYPES ====================

interface SmolabMessage {
  id: string
  role: 'user' | 'assistant' | 'error' | 'system'
  content: string
  timestamp: Date
  durationMs?: number
  agentName?: string
  agentPosition?: string
  agentAvatar?: string
  isTeamMessage?: boolean
  toolCallInfo?: { tool: string; detail: string }
  iterationInfo?: string
  // Phase 3: Frontend Suggestion Card (C2 — Smart TL Bridge)
  isWorkflowSuggestion?: boolean
  suggestionText?: string
  routingMode?: string
  routingTier?: number
  routingScore?: number
  assessmentRouting?: {
    mode: 'A' | 'B' | 'C'
    tier: 1 | 2 | 3
    score: number
    reasoning: string
    parts: Array<{ name: string; type: 'visual' | 'backend'; description: string; dependency: string[] }>
    spec: string
  }
  suggestionRejected?: boolean
}

// ==================== CONSTANTS ====================

const WORKFLOW_TRIGGER_KEYWORD = 'tiến hành triển khai'

// ==================== HELPERS ====================

function isWorkflowTrigger(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return lower.includes(WORKFLOW_TRIGGER_KEYWORD)
}

// ==================== PROPS ====================

interface CodeTeamTabProps {
  messages: SmolabMessage[]
  setMessages: React.Dispatch<React.SetStateAction<SmolabMessage[]>>
  currentSessionId: string
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  smolabAgents: any[]
  selectedAgentId: string | null
}

// ==================== COMPONENT ====================

export default function CodeTeamTab({
  messages,
  setMessages,
  currentSessionId,
  setCurrentSessionId,
  isLoading,
  setIsLoading,
  input,
  setInput,
  smolabAgents,
  selectedAgentId,
}: CodeTeamTabProps) {
  const skipMessageLoadRef = useRef(false)

  // ==================== WORKFLOW ====================

  const startWorkflow = useCallback(async (text: string, routing?: SmolabMessage['assessmentRouting'], options?: { skipUserMsg?: boolean }) => {
    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      skipMessageLoadRef.current = true
      setCurrentSessionId(sessionId)
    }

    const userMsg: SmolabMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
    if (!options?.skipUserMsg) {
      setMessages(prev => [...prev, userMsg])
    }
    setInput('')
    setIsLoading(true)

    const startMsg: SmolabMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '🔄 Code Team đang khởi động workflow...',
      timestamp: new Date(),
      isTeamMessage: true,
      agentName: 'SYSTEM',
      agentPosition: 'TL',
      agentAvatar: '🔒',
    }
    setMessages(prev => [...prev, startMsg])

    try {
      const chatMessages = (options?.skipUserMsg ? messages : [...messages, userMsg])
        .filter((m: SmolabMessage) => m.role === 'user' || m.role === 'assistant')
        .map((m: SmolabMessage) => ({ role: m.role, content: m.content }))

      const workflowBody: Record<string, unknown> = {
        messages: chatMessages,
        sessionId,
        userRequest: text,
      }
      if (routing) {
        workflowBody.routing = routing
      }

      const res = await fetch('/api/code-team/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowBody),
      })

      if (!res.ok) throw new Error(`Workflow API error: ${res.status}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentAgentMsgId: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue

          const jsonStr = trimmed.slice(6)
          let event: Record<string, unknown>
          try { event = JSON.parse(jsonStr) } catch { continue }

          const eventType = event.type as string

          switch (eventType) {
            case 'workflow_start':
              setMessages(prev => prev.map(m =>
                m.id === startMsg.id
                  ? { ...m, content: `🚀 Code Team workflow đã bắt đầu (Session: ${(event.sessionId as string || '').slice(0, 8)}...)` }
                  : m
              ))
              break

            case 'agent_start': {
              const agentMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                isTeamMessage: true,
                agentName: event.agent as string,
                agentPosition: event.position as string,
                agentAvatar: event.avatar as string,
              }
              currentAgentMsgId = agentMsg.id
              setMessages(prev => [...prev, agentMsg])
              break
            }

            case 'agent_chunk':
              if (currentAgentMsgId) {
                const chunkContent = event.content as string
                setMessages(prev => prev.map(m =>
                  m.id === currentAgentMsgId ? { ...m, content: chunkContent } : m
                ))
              }
              break

            case 'agent_complete':
              if (currentAgentMsgId) {
                const completeContent = event.content as string
                const duration = event.duration as number | undefined
                setMessages(prev => prev.map(m =>
                  m.id === currentAgentMsgId ? { ...m, content: completeContent || m.content, durationMs: duration } : m
                ))
                currentAgentMsgId = null
              }
              break

            case 'tool_call': {
              const toolMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `🔧 ${event.tool as string}`,
                timestamp: new Date(),
                isTeamMessage: true,
                agentName: event.agent as string,
                agentPosition: event.position as string,
                agentAvatar: '🔧',
                toolCallInfo: { tool: event.tool as string, detail: (event.detail as string) || '' },
              }
              setMessages(prev => [...prev, toolMsg])
              break
            }

            case 'checkpoint': {
              const checkpointMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `📋 Checkpoint: Step ${event.step as string}${event.decision ? ` → ${event.decision}` : ''}${event.reasoning ? `\n${event.reasoning}` : ''}`,
                timestamp: new Date(),
                isTeamMessage: true,
                agentName: 'CHECKPOINT',
                agentPosition: 'TL',
                agentAvatar: '📋',
              }
              setMessages(prev => [...prev, checkpointMsg])
              break
            }

            case 'workflow_done': {
              const totalDuration = event.totalDuration as number | undefined
              const doneMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `✅ Workflow hoàn thành!${totalDuration ? ` (${(totalDuration / 1000).toFixed(1)}s)` : ''}`,
                timestamp: new Date(),
                isTeamMessage: true,
                agentName: 'SYSTEM',
                agentPosition: 'TL',
                agentAvatar: '✅',
              }
              setMessages(prev => [...prev, doneMsg])
              break
            }

            case 'iteration':
              if (currentAgentMsgId) {
                const iterNum = event.iteration as number | undefined
                const maxIter = event.maxIterations as number | undefined
                const iterText = maxIter ? ` (Vòng ${iterNum}/${maxIter})` : ` (Vòng ${iterNum})`
                setMessages(prev => prev.map(m =>
                  m.id === currentAgentMsgId ? { ...m, iterationInfo: iterText } : m
                ))
              }
              break

            case 'error': {
              const errMsg: SmolabMessage = {
                id: crypto.randomUUID(),
                role: 'error',
                content: `❌ Workflow Error${event.agent ? ` (${event.agent})` : ''}: ${event.message as string}`,
                timestamp: new Date(),
              }
              setMessages(prev => [...prev, errMsg])
              break
            }
          }
        }
      }
    } catch (err) {
      const errMsg: SmolabMessage = {
        id: crypto.randomUUID(),
        role: 'error',
        content: `❌ Workflow failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsLoading(false)
    }
  }, [messages, currentSessionId, setCurrentSessionId, setMessages, setInput, setIsLoading])

  // ==================== SEND MESSAGE ====================

  const sendMessage = useCallback(async (queryText?: string) => {
    const text = queryText || input.trim()
    if (!text || isLoading) return

    // Direct workflow trigger
    if (isWorkflowTrigger(text)) {
      await startWorkflow(text)
      return
    }

    // Smart TL Assessment
    const userMsg: SmolabMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    if (!queryText) setInput('')
    setIsLoading(true)

    try {
      const recentHistory = [...messages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content }))

      const assessRes = await fetch('/api/code-team/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, chatHistory: recentHistory }),
      })

      if (!assessRes.ok) throw new Error(`Assessment API error: ${assessRes.status}`)

      const { assessment, isDirectTrigger } = await assessRes.json()

      if (isDirectTrigger) {
        await startWorkflow(text)
        return
      }

      if (assessment.decision === 'CODE_TEAM') {
        const routingMode = assessment.routing?.mode || 'B'
        let parts: NonNullable<SmolabMessage['assessmentRouting']>['parts']
        if (routingMode === 'A') {
          parts = [{ name: 'visual', type: 'visual' as const, description: text, dependency: [] }]
        } else if (routingMode === 'C') {
          parts = [
            { name: 'visual', type: 'visual' as const, description: `Phần giao diện UI/UX: ${text}`, dependency: [] },
            { name: 'backend', type: 'backend' as const, description: `Phần backend/logic: ${text}`, dependency: ['visual'] },
          ]
        } else {
          parts = [{ name: 'backend', type: 'backend' as const, description: text, dependency: [] }]
        }

        const assessmentRouting: SmolabMessage['assessmentRouting'] = assessment.routing
          ? {
              mode: assessment.routing.mode,
              tier: assessment.routing.tier,
              score: assessment.routing.score,
              reasoning: assessment.routing.reasoning || '',
              parts,
              spec: text,
            }
          : undefined

        const suggestionMsg: SmolabMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isTeamMessage: true,
          agentName: 'APEX',
          agentPosition: 'TL',
          agentAvatar: '🔒',
          isWorkflowSuggestion: true,
          suggestionText: assessment.suggestion || 'APEX đề xuất sử dụng Code Team để xử lý yêu cầu này.',
          routingMode: assessment.routing?.mode,
          routingTier: assessment.routing?.tier,
          routingScore: assessment.routing?.score,
          assessmentRouting,
        }
        setMessages(prev => [...prev, suggestionMsg])
      } else {
        const tlAnswer: SmolabMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: assessment.directAnswer || assessment.reasoning || 'Tôi hiểu yêu cầu của bạn. Bạn có thể hỏi thêm chi tiết hoặc sử dụng "tiến hành triển khai" để khởi động Code Team.',
          timestamp: new Date(),
          isTeamMessage: true,
          agentName: 'APEX',
          agentPosition: 'TL',
          agentAvatar: '🔒',
        }
        setMessages(prev => [...prev, tlAnswer])
      }
    } catch (err) {
      const errMsg: SmolabMessage = {
        id: crypto.randomUUID(),
        role: 'error',
        content: `⚠️ Không thể đánh giá yêu cầu. ${err instanceof Error ? err.message : 'Lỗi không xác định'}. Bạn có thể dùng "tiến hành triển khai" để khởi động Code Team trực tiếp.`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, startWorkflow, setInput, setIsLoading, setMessages])

  // ==================== RENDER ====================

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-stone-500 py-12">
              <Bot className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Code Team sẵn sàng</p>
              <p className="text-xs mt-1">Nhập yêu cầu hoặc dùng "tiến hành triển khai" để bắt đầu workflow</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : 'order-1'}`}>
                {/* Message Header */}
                {msg.isTeamMessage && msg.agentName && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-medium text-stone-400">
                      {msg.agentAvatar} {msg.agentName}
                      {msg.agentPosition && <span className="text-stone-500 ml-1">({msg.agentPosition})</span>}
                    </span>
                    {msg.iterationInfo && (
                      <span className="text-[9px] text-stone-500">{msg.iterationInfo}</span>
                    )}
                    <span className="text-[9px] text-stone-500 ml-auto">
                      {msg.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {/* Message Bubble */}
                <div className={`rounded-lg px-3 py-2 text-xs ${
                  msg.role === 'user'
                    ? 'bg-blue-600/30 text-blue-100 border border-blue-500/30'
                    : msg.role === 'error'
                    ? 'bg-red-950/30 text-red-300 border border-red-500/30'
                    : 'bg-stone-800/50 text-stone-200 border border-stone-700/30'
                }`}>
                  {/* Workflow Suggestion Card */}
                  {msg.isWorkflowSuggestion && !msg.suggestionRejected ? (
                    <div className="mt-1.5 p-3 rounded-lg border border-amber-500/30 bg-amber-950/20">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-amber-400 text-xs font-medium">🚀 APEX đề xuất Code Team</span>
                      </div>
                      <p className="text-[11px] text-gray-300 mb-2">{msg.suggestionText}</p>
                      {(msg.routingMode || msg.routingTier || msg.routingScore != null) && (
                        <div className="flex items-center gap-2 text-[9px] text-gray-400 mb-3">
                          {msg.routingMode && (
                            <span className="px-1.5 py-0.5 bg-slate-800/60 rounded">
                              Mode {msg.routingMode === 'A' ? 'A (Visual)' : msg.routingMode === 'B' ? 'B (Backend)' : 'C (Hybrid)'}
                            </span>
                          )}
                          {msg.routingTier && (
                            <span className="px-1.5 py-0.5 bg-slate-800/60 rounded">
                              Tier {msg.routingTier === 1 ? '1 Simple' : msg.routingTier === 2 ? '2 Medium' : '3 Complex'}
                            </span>
                          )}
                          {msg.routingScore != null && (
                            <span className="px-1.5 py-0.5 bg-slate-800/60 rounded">Score {msg.routingScore}/9</span>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const userMessages = messages.filter(m => m.role === 'user')
                            const lastUserMsg = userMessages[userMessages.length - 1]
                            if (lastUserMsg) {
                              setMessages(prev => prev.filter(m => m.id !== msg.id))
                              startWorkflow(lastUserMsg.content, msg.assessmentRouting, { skipUserMsg: true })
                            }
                          }}
                          className="px-3 py-1.5 text-[10px] bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 hover:bg-amber-500/30 transition-colors font-medium"
                        >
                          ✅ Triển khai
                        </button>
                        <button
                          onClick={() => {
                            setMessages(prev => prev.map(m =>
                              m.id === msg.id
                                ? { ...m, isWorkflowSuggestion: false, suggestionRejected: true, content: '✅ Đã hủy Code Team workflow.' }
                                : m
                            ))
                          }}
                          className="px-3 py-1.5 text-[10px] bg-slate-700/30 text-gray-400 rounded border border-slate-600/30 hover:bg-slate-700/50 transition-colors"
                        >
                          ❌ Không
                        </button>
                      </div>
                    </div>
                  ) : msg.suggestionRejected ? (
                    <p className="text-xs text-stone-400 italic">{msg.content}</p>
                  ) : (
                    <p className="text-xs whitespace-pre-wrap leading-relaxed text-stone-200">{msg.content}</p>
                  )}

                  {/* Tool Call Info */}
                  {msg.toolCallInfo && (
                    <div className="mt-2 p-2 rounded-lg bg-slate-950/50 border border-stone-700/50 text-[9px] text-stone-400">
                      🔧 {msg.toolCallInfo.tool}: {msg.toolCallInfo.detail?.slice(0, 150)}
                    </div>
                  )}

                  {/* Duration */}
                  {msg.durationMs && (
                    <div className="text-[8px] text-stone-500 mt-1">{(msg.durationMs / 1000).toFixed(1)}s</div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-stone-800/50 rounded-lg px-3 py-2 border border-stone-700/30">
                <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-stone-800 p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder='Nhập yêu cầu hoặc "tiến hành triển khai"...'
            disabled={isLoading}
            className="flex-1 bg-stone-900/50 border-stone-700 text-xs h-9"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            size="sm"
            className="h-9 px-3"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}