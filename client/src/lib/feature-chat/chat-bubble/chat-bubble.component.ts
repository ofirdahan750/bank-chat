import {
  ChangeDetectionStrategy,
  Component,
  Input,
  ViewEncapsulation,
  computed,
  signal,
} from '@angular/core';
import { ChatMessage, User } from '@poalim/shared-interfaces';

@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  templateUrl: './chat-bubble.component.html',
  styleUrl: './chat-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class ChatBubbleComponent {
  private readonly _message = signal<ChatMessage | null>(null);
  private readonly _currentUser = signal<User | null>(null);

  @Input({ required: true })
  set message(value: ChatMessage) {
    this._message.set(value);
  }
  protected readonly messageSig = computed(() => this._message());

  @Input({ required: true })
  set currentUser(value: User) {
    this._currentUser.set(value);
  }
  protected readonly currentUserSig = computed(() => this._currentUser());

  protected readonly isBot = computed(() => !!this.messageSig()?.sender.isBot);

  protected readonly isMine = computed(() => {
    const m = this.messageSig();
    const me = this.currentUserSig();
    if (!m || !me) return false;
    return m.sender.id === me.id && !m.sender.isBot;
  });

  protected readonly showSender = computed(() => {
    const m = this.messageSig();
    if (!m) return false;
    return !this.isMine() && !this.isBot();
  });

  protected formatChatTime(timestamp: number): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}
