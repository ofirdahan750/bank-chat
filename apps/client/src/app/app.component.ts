import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UIText } from '@poalim/constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent {
  protected readonly title = UIText.LOGIN.TITLE;
}
