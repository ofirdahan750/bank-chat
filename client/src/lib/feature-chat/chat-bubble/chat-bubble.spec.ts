// client/src/lib/feature-chat/chat-bubble/chat-bubble.component.spec.ts

import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { By } from '@angular/platform-browser';

import { ChatBubbleComponent } from './chat-bubble.component';
import { ChatMessage, ReactionKey, User } from '@poalim/shared-interfaces';

const user = (id: string, username: string, isBot = false): User => ({
  id,
  username,
  isBot,
  color: '#000',
});

const msg = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  sender: user('u1', 'Ofir'),
  content: 'hello',
  timestamp: 1,
  type: 'text',
  ...overrides,
});

describe('ChatBubbleComponent', () => {
  let fixture: ComponentFixture<ChatBubbleComponent>;
  let component: ChatBubbleComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatBubbleComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatBubbleComponent);
    component = fixture.componentInstance;

    component.message = msg();
    component.timeLabel = '12:00';
    component.meId = 'u1';
    component.isMine = true;
    component.canEdit = true;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnChanges() should add pulse class when message reference changes (not firstChange)', () => {
    const article = fixture.debugElement.query(By.css('article.chat-bubble'))
      .nativeElement as HTMLElement;

    expect(article.classList.contains('chat-bubble--pulse')).toBe(false);

    const prev = component.message;
    const next = msg({ content: 'updated' });

    component.message = next;

    component.ngOnChanges({
      message: new SimpleChange(prev, next, false),
    });

    fixture.detectChanges();

    expect(article.classList.contains('chat-bubble--pulse')).toBe(true);
  });

  it('startEdit() should set editForm value, enter editing mode, and close history', () => {
    component.showHistory.set(true);

    component.startEdit();

    expect(component.isEditing()).toBe(true);
    expect(component.showHistory()).toBe(false);
    expect(component.editForm.controls.content.value).toBe(
      component.message.content
    );
  });

  it('cancelEdit() should exit editing mode and reset editForm', () => {
    component.startEdit();

    component.editForm.controls.content.setValue('something else');
    component.cancelEdit();

    expect(component.isEditing()).toBe(false);
    expect(component.editForm.controls.content.value).toBe('');
  });

  it('saveEdit() should emit editSubmit when valid and changed, then exit editing', () => {
    const onEmit = jest.fn();
    component.editSubmit.subscribe(onEmit);

    component.startEdit();
    component.editForm.controls.content.setValue('NEW TEXT');

    component.saveEdit();

    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith({
      messageId: component.message.id,
      content: 'NEW TEXT',
    });
    expect(component.isEditing()).toBe(false);
  });

  it('saveEdit() should NOT emit when content is unchanged (trimmed) and should cancel edit', () => {
    const onEmit = jest.fn();
    component.editSubmit.subscribe(onEmit);

    component.startEdit();
    component.editForm.controls.content.setValue(
      `   ${component.message.content}   `
    );

    component.saveEdit();

    expect(onEmit).toHaveBeenCalledTimes(0);
    expect(component.isEditing()).toBe(false);
    expect(component.editForm.controls.content.value).toBe('');
  });

  it('saveEdit() should NOT emit when form is invalid and should mark touched', () => {
    const onEmit = jest.fn();
    component.editSubmit.subscribe(onEmit);

    component.startEdit();
    component.editForm.controls.content.setValue(''); // invalid (required)

    component.saveEdit();

    expect(onEmit).toHaveBeenCalledTimes(0);
    expect(component.editForm.touched).toBe(true);
    expect(component.isEditing()).toBe(true);
  });

  it('toggleHistory() should toggle showHistory signal', () => {
    expect(component.showHistory()).toBe(false);

    component.toggleHistory();
    expect(component.showHistory()).toBe(true);

    component.toggleHistory();
    expect(component.showHistory()).toBe(false);
  });

  it('toggleReaction() should emit reactionToggle', () => {
    const onEmit = jest.fn();
    component.reactionToggle.subscribe(onEmit);

    component.toggleReaction('like');

    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith({
      messageId: component.message.id,
      reaction: 'like',
    });
  });

  it('reactionCount() should return number of ids for that reaction', () => {
    component.message = msg({
      reactions: {
        like: ['u1', 'u2'],
        wow: ['u3'],
      },
    });

    expect(component.reactionCount('like')).toBe(2);
    expect(component.reactionCount('wow')).toBe(1);
    expect(component.reactionCount('sad')).toBe(0);
  });

  it('hasReacted() should reflect if meId exists in reaction list', () => {
    component.meId = 'u1';
    component.message = msg({
      reactions: {
        heart: ['u1', 'u9'],
      },
    });

    expect(component.hasReacted('heart')).toBe(true);
    expect(component.hasReacted('like')).toBe(false);

    component.meId = '';
    expect(component.hasReacted('heart')).toBe(false);
  });

  it('formatHistoryTime() should return "" for invalid timestamp, and non-empty string for valid timestamp', () => {
    expect(component.formatHistoryTime(Number.NaN)).toBe('');

    const out = component.formatHistoryTime(Date.now());
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('template: clicking edit icon should enter edit mode', () => {
    component.canEdit = true;
    fixture.detectChanges();

    const btn = fixture.debugElement.query(By.css('button.chat-bubble__icon'));
    expect(btn).toBeTruthy();

    btn.nativeElement.click();
    fixture.detectChanges();

    expect(component.isEditing()).toBe(true);
  });

  it('template: clicking a reaction button should emit the matching key', () => {
    const onEmit = jest.fn();
    component.reactionToggle.subscribe(onEmit);

    fixture.detectChanges();

    const firstBtn = fixture.debugElement.query(
      By.css('button.chat-bubble__reaction')
    );
    expect(firstBtn).toBeTruthy();

    const firstKey = (component as any).reactionOptions?.[0]
      ?.KEY as ReactionKey;
    expect(firstKey).toBeTruthy();

    firstBtn.nativeElement.click();

    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith({
      messageId: component.message.id,
      reaction: firstKey,
    });
  });
});
