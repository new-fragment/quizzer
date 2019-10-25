import React from 'react';
import { Route, Switch } from 'react-router-dom';

import QMHome from './QMHome';
import QMTeams from './QMTeams';
import QMCategories from './QMCategories';
import QMQuestions from './QMQuestions';

const QM = () => {
  return (
    <Switch>
      <Route exact path="/master">
        <QMHome />
      </Route>
      <Route path="/master/teams">
        <QMTeams />
      </Route>
      <Route path="/master/categories">
        <QMCategories />
      </Route>
      <Route path="/master/questions">
        <QMQuestions />
      </Route>
    </Switch>
  );
};

export default QM;