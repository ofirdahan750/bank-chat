/* FILE: client/src/lib/feature-chat/feature-chat.spec.ts */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { AppConfig, ChatUi, FEATURE_CHAT_DOM_IDS, UI_TEXT } from '@poalim/constants';
import { ChatMessage, ReactionKey, User } from '@poalim/shared-interfaces';
import { FeatureChat } from './feature-chat.component';
import { ChatStore } from './services/chat-store/chat-store.service';

class ChatStoreStub {
  readonly username = signal<string>('');
  readonly messages = signal<ChatMessage[]>([]);
  readonly hasNickname = signal<boolean>(false);

  readonly me = signal<User>({
    id: 'me',
    username: 'me',
    isBot: false,
    color: ChatUi.USER.DEFAULT_COLOR,
  });

  init = jest.fn();
  submitNickname = jest.fn((name: string) => {
    const clean = name.trim();
    this.username.set(clean);
    this.hasNickname.set(clean.length >= AppConfig.MIN_USERNAME_LENGTH);
    this.me.set({
      id: clean || ChatUi.USER.DEFAULT_ID,
      username: clean,
      isBot: false,
      color: ChatUi.USER.DEFAULT_COLOR,
    });
  });

  send = jest.fn();
  editMessage = jest.fn();
  toggleReaction = jest.fn();

  logout = jest.fn(() => {
    this.username.set('');
    this.hasNickname.set(false);
    this.messages.set([]);
  });
}

describe('FeatureChat', () => {
  let fixture: ComponentFixture<FeatureChat>;
  let component: FeatureChat;
  let store: ChatStoreStub;

  beforeEach(async () => {
    store = new ChatStoreStub();

    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, FeatureChat],
      providers: [{ provide: ChatStore, useValue: store }],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureChat);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call chatStore.init() on init', () => {
    expect(store.init).toHaveBeenCalledTimes(1);
  });

  it('should render nickname UI when hasNickname() is false', () => {
    store.hasNickname.set(false);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement as HTMLElement;

    const title = el.querySelector('.feature-chat__title');
    expect(title?.textContent?.trim()).toBe(UI_TEXT.LOGIN.TITLE);

    const nicknameInput = el.querySelector(
      `#${FEATURE_CHAT_DOM_IDS.NICKNAME_INPUT}`
    ) as HTMLInputElement | null;
    expect(nicknameInput).not.toBeNull();

    const logoutBtn = el.querySelector('.feature-chat__logout');
    expect(logoutBtn).toBeNull();
  });

  it('should render room UI when hasNickname() is true', () => {
    store.username.set('Ofir');
    store.hasNickname.set(true);
    store.me.set({
      id: 'Ofir',
      username: 'Ofir',
      isBot: false,
      color: ChatUi.USER.DEFAULT_COLOR,
    });

    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement as HTMLElement;

    const roomTitle = el.querySelector('.feature-chat__room-title');
    expect(roomTitle?.textContent?.trim()).toBe('Ofir');

    const logoutBtn = el.querySelector('.feature-chat__logout');
    expect(logoutBtn).not.toBeNull();
  });

  it('submitNickname() should trim and call store.submitNickname() when valid', () => {
    const ctrl = component['nicknameForm'].controls.username;

    ctrl.setValue(`  Ofir  `);
    ctrl.markAsTouched();

    (component as any).submitNickname();

    expect(ctrl.value).toBe('Ofir');
    expect(store.submitNickname).toHaveBeenCalledWith('Ofir');
  });

  it('submitNickname() should not call store.submitNickname() when invalid', () => {
    const ctrl = component['nicknameForm'].controls.username;

    ctrl.setValue(''); // required -> invalid
    ctrl.markAsTouched();

    (component as any).submitNickname();

    expect(store.submitNickname).not.toHaveBeenCalled();
  });

  it('send() should trim, call store.send(), and reset the composer form when valid', () => {
    const ctrl = component['composerForm'].controls.content;

    ctrl.setValue('  hello  ');
    ctrl.markAsTouched();

    (component as any).send();

    expect(store.send).toHaveBeenCalledWith('hello');
    expect(component['composerForm'].controls.content.value).toBe('');
  });

  it('send() should not call store.send() when invalid', () => {
    const ctrl = component['composerForm'].controls.content;

    ctrl.setValue(''); // required -> invalid
    ctrl.markAsTouched();

    (component as any).send();

    expect(store.send).not.toHaveBeenCalled();
  });

  it('onEditSubmit() should forward to store.editMessage()', () => {
    (component as any).onEditSubmit({ messageId: 'm1', content: 'next' });

    expect(store.editMessage).toHaveBeenCalledWith('m1', 'next');
  });

  it('onReactionToggle() should forward to store.toggleReaction()', () => {
    const reaction: ReactionKey = 'like';

    (component as any).onReactionToggle({ messageId: 'm1', reaction });

    expect(store.toggleReaction).toHaveBeenCalledWith('m1', reaction);
  });

  it('logout() should call store.logout() and reset forms', () => {
    component['nicknameForm'].controls.username.setValue('Ofir');
    component['composerForm'].controls.content.setValue('hello');

    (component as any).logout();

    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(component['nicknameForm'].controls.username.value).toBe('');
    expect(component['composerForm'].controls.content.value).toBe('');
  });

  it('formatChatTime() should return empty string for invalid timestamp', () => {
    const out = (component as any).formatChatTime(Number.NaN);
    expect(out).toBe('');
  });
});
