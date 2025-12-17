import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { UIText } from '@poalim/constants';

@Component({
  standalone: true,
  imports: [RouterModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  readonly appTitle = UIText.LOGIN.TITLE;
}
